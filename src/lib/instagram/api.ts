import { MetaSendError, type MetaErrorBody } from '@/lib/instagram/errors'
import { META_LIMITS, truncateBytes, truncateChars } from '@/lib/flow/types'

const GRAPH = 'https://graph.instagram.com/v23.0'

/**
 * NOTA DE ARQUIVO — o corte de tamanho espalhado pelas funções abaixo é a
 * última linha de defesa dos limites da Meta.
 *
 * O schema em `flow/types.ts` já valida o template no builder, mas o texto
 * CRESCE depois: o engine interpola `{{nome}}` na hora do envio e o nome só
 * existe em tempo de execução — o que o Zod aprovou não é o que sai. O
 * carrossel tem o mesmo problema: o texto de fallback da private reply é a
 * junção dos títulos dos 10 cards, montada só no envio.
 *
 * Estourar o limite não trunca a mensagem do lado da Meta: ela RECUSA a
 * mensagem inteira (erro 100), o `flow_run` morre no meio e o contato fica com
 * meia conversa. Então aqui se corta, não se lança — pelo mesmo motivo que o
 * título de quick reply já vinha com `slice(0, 20)`. Mensagem cortada é pior
 * que mensagem inteira e muito melhor que fluxo derrubado; validar de novo e
 * falhar aqui seria falhar tarde, em produção, que é exatamente o que se quer
 * evitar.
 */

export interface QuickReply {
  title: string
  payload: string
}

interface SendArgs {
  igUserId: string
  accessToken: string
  recipient: { id: string } | { comment_id: string }
  message: Record<string, unknown>
}

async function send({ igUserId, accessToken, recipient, message }: SendArgs) {
  const res = await fetch(`${GRAPH}/${igUserId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ recipient, message }),
  })

  const raw = await res.text()
  const json = (() => {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  })()

  if (!res.ok) {
    // `MetaSendError` em vez de `Error` cru: quem chama precisa saber se vale
    // retentar. Erro permanente retentado reexecuta o fluxo do início e
    // reentrega mensagem já enviada — ver o comentário em errors.ts.
    throw new MetaSendError({ status: res.status, body: json as MetaErrorBody, raw })
  }
  return json as { recipient_id?: string; message_id?: string }
}

/**
 * DM comum. Só permitido dentro da janela de 24h desde a última mensagem
 * recebida do contato — quem checa isso é o engine, não esta função.
 */
export function sendText(args: {
  igUserId: string
  accessToken: string
  recipientId: string
  text: string
  quickReplies?: QuickReply[]
}) {
  const message: Record<string, unknown> = {
    text: truncateBytes(args.text, META_LIMITS.TEXT_BYTES),
  }

  if (args.quickReplies?.length) {
    message.quick_replies = args.quickReplies.slice(0, 13).map((qr) => ({
      content_type: 'text',
      // `truncateChars` e não `slice`: `slice` corta no meio do par substituto
      // e o emoji vira UTF-8 quebrado, que a Meta recusa igual.
      title: truncateChars(qr.title, META_LIMITS.BUTTON_TITLE_CHARS),
      payload: qr.payload,
    }))
  }

  return send({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    recipient: { id: args.recipientId },
    message,
  })
}

export type TemplateButton = { title: string; url?: string; payload?: string }

/**
 * Botões de template: `web_url` e `postback` são os únicos tipos que o
 * Instagram aceita, no máximo 3. Uma função só para os três lugares que montam
 * botão (button template, carrossel e private reply) — assim o corte do
 * payload existe uma vez, e não três.
 */
function templateButtons(buttons: TemplateButton[]) {
  return buttons.slice(0, 3).map((b) => {
    // O engine roda spintax e interpola o título antes de chegar aqui, então
    // 20 caracteres validados no builder podem ter virado outra coisa.
    const title = truncateChars(b.title, META_LIMITS.BUTTON_TITLE_CHARS)

    return b.url
      ? { type: 'web_url', url: b.url, title }
      : {
          type: 'postback',
          title,
          payload: truncateChars(b.payload ?? b.title, META_LIMITS.POSTBACK_PAYLOAD_CHARS),
        }
  })
}

/** Card com botões (link ou postback). Máximo 3 botões. */
export function sendButtons(args: {
  igUserId: string
  accessToken: string
  recipientId: string
  text: string
  buttons: TemplateButton[]
}) {
  return send({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    recipient: { id: args.recipientId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          // Aqui a Meta conta caracteres (640), não bytes como no texto de DM.
          text: truncateChars(args.text, META_LIMITS.BUTTON_TEMPLATE_CHARS),
          buttons: templateButtons(args.buttons),
        },
      },
    },
  })
}

export interface CarouselCard {
  title: string
  subtitle?: string
  imageUrl?: string
  buttons?: TemplateButton[]
}

function carouselElements(cards: CarouselCard[]) {
  return cards.slice(0, 10).map((card) => ({
    title: truncateChars(card.title, META_LIMITS.CAROUSEL_TITLE_CHARS),
    ...(card.subtitle
      ? { subtitle: truncateChars(card.subtitle, META_LIMITS.CAROUSEL_TITLE_CHARS) }
      : {}),
    ...(card.imageUrl ? { image_url: card.imageUrl } : {}),
    ...(card.buttons?.length ? { buttons: templateButtons(card.buttons) } : {}),
  }))
}

/**
 * Carrossel de cards (generic template): até 10, cada um com título, subtítulo,
 * imagem por URL pública e até 3 botões. É o formato que o Instagram herda do
 * template genérico do Messenger — não existe um "carousel" próprio na API.
 *
 * NÃO APARECE NO INSTAGRAM WEB: "this feature is currently not available in the
 * web version". Quem abre o direct pelo navegador não vê o carrossel, e isso
 * muda a decisão de usar o bloco — se a oferta depende do card, parte do
 * público não recebe a oferta.
 *
 * Cada card exige ao menos uma propriedade além do `title` (subtítulo, imagem
 * ou botão); só título faz a Meta recusar a mensagem inteira. Quem barra isso
 * antes do envio é o `carouselCardSchema` em `flow/types.ts`.
 */
export function sendCarousel(args: {
  igUserId: string
  accessToken: string
  recipientId: string
  cards: CarouselCard[]
}) {
  return send({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    recipient: { id: args.recipientId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: carouselElements(args.cards),
        },
      },
    },
  })
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file'

/**
 * Anexo por URL pública — a Meta busca o arquivo, não subimos binário.
 * Imagem, vídeo, áudio e arquivo são a mesma chamada com um `type` diferente
 * no attachment: uma função só em vez de quatro (`sendImage`, `sendVideo`,
 * `sendAudio`, `sendFile`) quase idênticas.
 */
export function sendMedia(args: {
  igUserId: string
  accessToken: string
  recipientId: string
  type: MediaKind
  url: string
}) {
  return send({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    recipient: { id: args.recipientId },
    message: {
      attachment: { type: args.type, payload: { url: args.url } },
    },
  })
}

/**
 * Private reply: DM disparada a partir de um comentário.
 * Só uma vez por comentário e até 7 dias depois dele.
 * É o que faz o "comenta EU QUERO que eu te mando" funcionar.
 */
export async function sendPrivateReply(args: {
  igUserId: string
  accessToken: string
  commentId: string
  text: string
  buttons?: TemplateButton[]
  quickReplies?: QuickReply[]
  cards?: CarouselCard[]
}) {
  const recipient = { comment_id: args.commentId }
  const base = { igUserId: args.igUserId, accessToken: args.accessToken, recipient }

  // Carrossel como abertura de comentário: se a Meta recusar template nesta
  // private reply, cai para texto — perder o formato ainda é melhor que
  // perder o lead.
  if (args.cards?.length) {
    try {
      return await send({
        ...base,
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: carouselElements(args.cards),
            },
          },
        },
      })
    } catch (error) {
      console.error('[dm-flow] private reply com carrossel falhou, caindo para texto:', error)
    }
  }

  // Botão na private reply é o que destrava fluxo de comentário: clicar num
  // botão de postback conta como mensagem da pessoa e ABRE a janela de 24h.
  // Sem isso, a automação só consegue mandar uma mensagem e morre.
  if (args.buttons?.length) {
    try {
      return await send({
        ...base,
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: truncateChars(args.text, META_LIMITS.BUTTON_TEMPLATE_CHARS),
              buttons: templateButtons(args.buttons),
            },
          },
        },
      })
    } catch (error) {
      // Se a Meta recusar template nesta private reply, o texto ainda vale
      // mais que perder o lead.
      console.error('[dm-flow] private reply com botões falhou, caindo para texto:', error)
    }
  }

  // O texto que sobra aqui pode ser o fallback do carrossel (títulos dos 10
  // cards colados), montado no engine e nunca visto pelo schema.
  const message: Record<string, unknown> = {
    text: truncateBytes(args.text, META_LIMITS.TEXT_BYTES),
  }
  if (args.quickReplies?.length) {
    message.quick_replies = args.quickReplies.slice(0, 13).map((qr) => ({
      content_type: 'text',
      // `truncateChars` e não `slice`: `slice` corta no meio do par substituto
      // e o emoji vira UTF-8 quebrado, que a Meta recusa igual.
      title: truncateChars(qr.title, META_LIMITS.BUTTON_TITLE_CHARS),
      payload: qr.payload,
    }))
  }

  return send({ ...base, message })
}

/** Resposta pública no próprio comentário. */
export async function replyToComment(args: {
  accessToken: string
  commentId: string
  message: string
}) {
  const res = await fetch(`${GRAPH}/${args.commentId}/replies`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({ message: args.message }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Resposta pública falhou (${res.status}): ${JSON.stringify(json)}`)
  return json
}

export interface IceBreaker {
  question: string
  payload: string
}

const ICE_BREAKER_MAX = 4
const ICE_BREAKER_QUESTION_MAX_LEN = 80

/**
 * Publica as perguntas fixas que aparecem quando alguém abre o direct com a
 * conta pela primeira vez. Configuração de CONTA, não bloco de fluxo —
 * `POST /{ig-id}/messenger_profile`. Ao tocar, a Meta manda um
 * `messaging_postback` com esse payload; quem decide o que acontece é o
 * matcher de gatilho de palavra-chave já existente (crie uma automação com
 * `match_mode: exact` usando o mesmo payload como palavra-chave).
 */
export async function setIceBreakers(args: {
  igUserId: string
  accessToken: string
  iceBreakers: IceBreaker[]
}): Promise<void> {
  if (args.iceBreakers.length > ICE_BREAKER_MAX) {
    throw new Error(`Máximo de ${ICE_BREAKER_MAX} ice breakers.`)
  }

  const res = await fetch(`${GRAPH}/${args.igUserId}/messenger_profile`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({
      platform: 'instagram',
      ice_breakers: [
        {
          call_to_actions: args.iceBreakers.map((ib) => ({
            question: ib.question.slice(0, ICE_BREAKER_QUESTION_MAX_LEN),
            payload: ib.payload,
          })),
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Publicação dos ice breakers falhou (${res.status}): ${await res.text()}`)
  }
}

/** Remove os ice breakers publicados na conta. Não mexe no que está salvo no banco. */
export async function clearIceBreakers(args: { accessToken: string }): Promise<void> {
  const res = await fetch(`${GRAPH}/me/messenger_profile`, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({ fields: ['ice_breakers'] }),
  })

  if (!res.ok) {
    throw new Error(`Remoção dos ice breakers falhou (${res.status}): ${await res.text()}`)
  }
}

/** O que está publicado ao vivo na conta agora — para o painel comparar com o banco. */
export async function getIceBreakers(args: { accessToken: string }): Promise<IceBreaker[]> {
  const res = await fetch(`${GRAPH}/me/messenger_profile?fields=ice_breakers`, {
    headers: { authorization: `Bearer ${args.accessToken}` },
  })

  if (!res.ok) return []
  const json = (await res.json()) as {
    ice_breakers?: Array<{ call_to_actions?: IceBreaker[] }>
  }
  return json.ice_breakers?.[0]?.call_to_actions ?? []
}

/**
 * Campos de webhook que a conta precisa assinar. Cadastrar a URL de callback no
 * painel do app NÃO basta: cada conta conectada precisa se inscrever, senão a
 * Meta simplesmente não entrega evento nenhum e o app fica mudo.
 */
const WEBHOOK_FIELDS = [
  'comments',
  'messages',
  'messaging_postbacks',
  'messaging_seen',
  'live_comments',
] as const

export async function subscribeToWebhooks(accessToken: string): Promise<void> {
  const params = new URLSearchParams({ subscribed_fields: WEBHOOK_FIELDS.join(',') })

  const res = await fetch(`${GRAPH}/me/subscribed_apps?${params}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Inscrição nos webhooks falhou (${res.status}): ${await res.text()}`)
  }
}

export async function getWebhookSubscriptions(accessToken: string): Promise<string[]> {
  const res = await fetch(`${GRAPH}/me/subscribed_apps`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) return []
  const json = (await res.json()) as { data?: Array<{ subscribed_fields?: string[] }> }
  return json.data?.[0]?.subscribed_fields ?? []
}

export interface Media {
  id: string
  caption?: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_url?: string
  thumbnail_url?: string
  permalink: string
  timestamp: string
  comments_count?: number
  like_count?: number
}

/** Posts e reels da conta, para o grid de seleção do builder. */
export async function fetchMedia(args: {
  igUserId: string
  accessToken: string
  limit?: number
}): Promise<Media[]> {
  const params = new URLSearchParams({
    fields:
      'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count',
    limit: String(args.limit ?? 25),
  })

  const res = await fetch(`${GRAPH}/${args.igUserId}/media?${params}`, {
    headers: { authorization: `Bearer ${args.accessToken}` },
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Busca de mídia falhou (${res.status}): ${await res.text()}`)
  const json = (await res.json()) as { data?: Media[] }
  return json.data ?? []
}

export interface ContactProfile {
  name?: string
  username?: string
  /**
   * URL assinada da foto — EXPIRA em horas/dias, não é permanente. Nunca
   * assuma que continua válida: quem grava isso precisa saber que vai
   * quebrar depois (ver `profile_synced_at` em `contacts`, migration 0012).
   */
  profile_pic?: string
  follower_count?: number
  is_verified_user?: boolean
}

/**
 * Perfil do contato. Só disponível depois que ele mandou mensagem para a
 * conta — quem só comentou não deu consentimento e a Graph API responde
 * "User consent is required to access user profile". Isso não é uma falha:
 * `!res.ok` cobre esse caso e devolve `null` como qualquer outro perfil
 * indisponível, sem logar erro. Quem chama decide markInbound antes de
 * chamar esta função, então esse cenário não deveria nem chegar aqui.
 */
export async function fetchContactProfile(args: {
  accessToken: string
  contactIgId: string
}): Promise<ContactProfile | null> {
  const params = new URLSearchParams({
    fields: 'name,username,profile_pic,follower_count,is_verified_user',
  })
  const res = await fetch(`${GRAPH}/${args.contactIgId}?${params}`, {
    headers: { authorization: `Bearer ${args.accessToken}` },
  })

  if (!res.ok) return null
  return res.json() as Promise<ContactProfile>
}
