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

/** Imagem por URL pública — a Meta busca o arquivo, não subimos binário. */
export function sendImage(args: {
  igUserId: string
  accessToken: string
  recipientId: string
  url: string
}) {
  return send({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    recipient: { id: args.recipientId },
    message: {
      attachment: { type: 'image', payload: { url: args.url } },
    },
  })
}

/**
 * Private reply: DM disparada a partir de um comentário.
 * Só uma vez por comentário e até 7 dias depois dele.
 * É o que faz o "comenta EU QUERO que eu te mando" funcionar.
 */
export function sendPrivateReply(args: {
  igUserId: string
  accessToken: string
  commentId: string
  text: string
}) {
  return send({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    recipient: { comment_id: args.commentId },
    message: { text: args.text },
  })
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

/** Perfil do contato. Só disponível depois que ele mandou mensagem para a conta. */
export async function fetchContactProfile(args: { accessToken: string; contactIgId: string }) {
  const params = new URLSearchParams({ fields: 'name,username' })
  const res = await fetch(`${GRAPH}/${args.contactIgId}?${params}`, {
    headers: { authorization: `Bearer ${args.accessToken}` },
  })

  if (!res.ok) return null
  return res.json() as Promise<{ name?: string; username?: string }>
}
