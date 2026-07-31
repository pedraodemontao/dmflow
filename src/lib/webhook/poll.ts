import { supabaseAdmin } from '@/lib/supabase/admin'
import { enqueue, processPending, type CommentValue, type MessagingValue } from '@/lib/webhook/process'
import type { Account } from '@/types/db'

/**
 * Fallback de polling: busca comentários e DMs recentes direto na API e
 * alimenta a MESMA fila do webhook. Existe porque a entrega de webhooks da
 * Meta pode falhar silenciosamente; a leitura, não. O dedup_key da fila
 * (comment:<id> / msg:<mid>) torna webhook e polling idempotentes entre si.
 */

const GRAPH = 'https://graph.instagram.com/v23.0'

/** Só olha para trás até aqui — comentário mais velho já era. */
const LOOKBACK_MS = 60 * 60 * 1000
/** Quantos posts recentes varrer por rodada. */
const MEDIA_LIMIT = 10

interface RawComment {
  id: string
  text?: string
  timestamp?: string
  username?: string
  from?: { id?: string; username?: string }
}

/**
 * Erro que impede a varredura de acontecer — token morto, conta bloqueada,
 * Meta fora do ar. Diferente de "varri e não achei nada", que é sucesso.
 *
 * Em 30/07 o token foi invalidado e esta função devolvia `null` para tudo:
 * o tick reportava sucesso por 22 horas com o sistema morto.
 */
export class PollError extends Error {
  constructor(public readonly detail: string) {
    super(detail)
  }
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new PollError(body.error?.message ?? `HTTP ${res.status} em ${new URL(url).pathname}`)
  }

  return res.json() as Promise<T>
}

async function pollComments(account: Account): Promise<number> {
  const media = await fetchJson<{ data?: Array<{ id: string }> }>(
    `${GRAPH}/me/media?fields=id&limit=${MEDIA_LIMIT}`,
    account.access_token,
  )
  if (!media.data?.length) return 0

  const cutoff = Date.now() - LOOKBACK_MS
  const events: Array<{ dedupKey: string; igAccountId: string; kind: 'comment'; value: CommentValue }> = []

  for (const item of media.data) {
    const comments = await fetchJson<{ data?: RawComment[] }>(
      `${GRAPH}/${item.id}/comments?fields=id,text,timestamp,username,from&limit=25`,
      account.access_token,
    )

    for (const comment of comments.data ?? []) {
      if (comment.timestamp && new Date(comment.timestamp).getTime() < cutoff) continue

      const fromId = comment.from?.id
      const fromUsername = comment.from?.username ?? comment.username
      // Comentário da própria conta não dispara automação.
      if (fromId && fromId === account.ig_user_id) continue
      if (!fromId && fromUsername && fromUsername === account.username) continue

      events.push({
        dedupKey: `comment:${comment.id}`,
        igAccountId: account.ig_user_id,
        kind: 'comment',
        value: {
          id: comment.id,
          text: comment.text ?? '',
          // Sem `from.id` a API ainda permite private reply (recipient é o
          // comment_id); usamos o id do comentário como identidade provisória
          // do contato até a primeira DM dele chegar.
          from: { id: fromId ?? `comment_author:${comment.id}`, username: fromUsername },
          media: { id: item.id },
        },
      })
    }
  }

  if (events.length) await enqueue(events)
  return events.length
}

interface RawMessage {
  id: string
  created_time?: string
  from?: { id?: string; username?: string }
  message?: string
}

async function pollMessages(account: Account): Promise<number> {
  const conversations = await fetchJson<{
    data?: Array<{ messages?: { data?: RawMessage[] } }>
  }>(
    `${GRAPH}/me/conversations?fields=messages.limit(5){id,created_time,from,message}&limit=15`,
    account.access_token,
  )
  if (!conversations.data?.length) return 0

  const cutoff = Date.now() - LOOKBACK_MS
  const events: Array<{ dedupKey: string; igAccountId: string; kind: 'messaging'; value: MessagingValue }> = []

  for (const conversation of conversations.data) {
    for (const message of conversation.messages?.data ?? []) {
      if (!message.from?.id || message.from.id === account.ig_user_id) continue
      if (message.created_time && new Date(message.created_time).getTime() < cutoff) continue

      events.push({
        dedupKey: `msg:${message.id}`,
        igAccountId: account.ig_user_id,
        kind: 'messaging',
        value: {
          sender: { id: message.from.id },
          message: { mid: message.id, text: message.message ?? '' },
        },
      })
    }
  }

  if (events.length) await enqueue(events)
  return events.length
}

export interface PollResult {
  comments: number
  messages: number
  processed: number
  /** Contas que não deu nem para varrer. Vazio = varredura saudável. */
  errors: Array<{ account: string; detail: string }>
}

export async function pollAll(): Promise<PollResult> {
  const { data } = await supabaseAdmin.from('accounts').select('*').eq('is_active', true)
  const accounts = (data ?? []) as Account[]

  let comments = 0
  let messages = 0
  const errors: PollResult['errors'] = []

  for (const account of accounts) {
    const name = account.username ?? account.ig_user_id

    try {
      comments += await pollComments(account)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error('[dm-flow] poll de comentários falhou:', name, detail)
      errors.push({ account: name, detail })
    }

    try {
      messages += await pollMessages(account)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error('[dm-flow] poll de mensagens falhou:', name, detail)
      errors.push({ account: name, detail })
    }
  }

  // A fila é varrida mesmo sem novidade: pode haver evento adiado por
  // silêncio, por pânico ou por cap que já venceu.
  const processed = await processPending(50)
  return { comments, messages, processed, errors }
}
