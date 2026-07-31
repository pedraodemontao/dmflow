const GRAPH = 'https://graph.instagram.com/v23.0'

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

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Envio falhou (${res.status}): ${JSON.stringify(json)}`)
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
  const message: Record<string, unknown> = { text: args.text }

  if (args.quickReplies?.length) {
    message.quick_replies = args.quickReplies.slice(0, 13).map((qr) => ({
      content_type: 'text',
      title: qr.title.slice(0, 20),
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

/** Card com botões (link ou postback). Máximo 3 botões. */
export function sendButtons(args: {
  igUserId: string
  accessToken: string
  recipientId: string
  text: string
  buttons: Array<{ title: string; url?: string; payload?: string }>
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
          text: args.text,
          buttons: args.buttons.slice(0, 3).map((b) =>
            b.url
              ? { type: 'web_url', url: b.url, title: b.title }
              : { type: 'postback', title: b.title, payload: b.payload ?? b.title },
          ),
        },
      },
    },
  })
}

export interface CarouselCard {
  title: string
  subtitle?: string
  imageUrl?: string
  buttons?: Array<{ title: string; url?: string; payload?: string }>
}

function carouselElements(cards: CarouselCard[]) {
  return cards.slice(0, 10).map((card) => ({
    title: card.title,
    ...(card.subtitle ? { subtitle: card.subtitle } : {}),
    ...(card.imageUrl ? { image_url: card.imageUrl } : {}),
    ...(card.buttons?.length
      ? {
          buttons: card.buttons.slice(0, 3).map((b) =>
            b.url
              ? { type: 'web_url', url: b.url, title: b.title }
              : { type: 'postback', title: b.title, payload: b.payload ?? b.title },
          ),
        }
      : {}),
  }))
}

/**
 * Carrossel de cards (generic template): até 10, cada um com título, subtítulo,
 * imagem por URL pública e até 3 botões. É o formato que o Instagram herda do
 * template genérico do Messenger — não existe um "carousel" próprio na API.
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
  buttons?: Array<{ title: string; url?: string; payload?: string }>
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
              text: args.text,
              buttons: args.buttons.slice(0, 3).map((b) =>
                b.url
                  ? { type: 'web_url', url: b.url, title: b.title }
                  : { type: 'postback', title: b.title, payload: b.payload ?? b.title },
              ),
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

  const message: Record<string, unknown> = { text: args.text }
  if (args.quickReplies?.length) {
    message.quick_replies = args.quickReplies.slice(0, 13).map((qr) => ({
      content_type: 'text',
      title: qr.title.slice(0, 20),
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
