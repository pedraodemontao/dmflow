import { supabaseAdmin } from '@/lib/supabase/admin'
import { fetchContactProfile, replyToComment } from '@/lib/instagram/api'
import { resumeFlow, startFlow } from '@/lib/flow/engine'
import { assertUnderSendCap, logSend } from '@/lib/flow/send-cap'
import { spin } from '@/lib/flow/spintax'
import { findTrigger } from '@/lib/flow/triggers'
import type { Account, Contact, Flow, FlowRun } from '@/types/db'

/** Resposta instantânea a comentário é assinatura de bot: segura 30–120s. */
const COMMENT_JITTER_MIN_MS = 30_000
const COMMENT_JITTER_RANGE_MS = 90_000

function jitteredProcessAfter(kind: 'messaging' | 'comment'): string {
  if (kind !== 'comment') return new Date().toISOString()
  const delay = COMMENT_JITTER_MIN_MS + Math.random() * COMMENT_JITTER_RANGE_MS
  return new Date(Date.now() + delay).toISOString()
}

/** Formato dos eventos que a Meta entrega. Tudo opcional: o payload varia por tipo. */
export interface MessagingValue {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    quick_reply?: { payload?: string }
    reply_to?: { story?: unknown; mid?: string }
  }
  postback?: { mid?: string; title?: string; payload?: string }
}

export interface CommentValue {
  id?: string
  text?: string
  from?: { id?: string; username?: string }
  media?: { id?: string; media_product_type?: string }
  parent_id?: string
}

/** Um item do webhook: ou uma mensagem, ou uma mudança de comentário. */
type QueuedEvent =
  | { dedupKey: string; igAccountId: string; kind: 'messaging'; value: MessagingValue }
  | { dedupKey: string; igAccountId: string; kind: 'comment'; value: CommentValue }

interface WebhookPayload {
  object?: string
  entry?: Array<{
    id: string
    time?: number
    messaging?: MessagingValue[]
    changes?: Array<{ field: string; value: CommentValue }>
  }>
}

/**
 * Quebra o payload da Meta em eventos individuais.
 * dedup_key evita processar duas vezes quando a Meta reentrega (ela reentrega).
 */
export function flattenPayload(payload: WebhookPayload): QueuedEvent[] {
  const events: QueuedEvent[] = []

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const mid: string | undefined = messaging.message?.mid ?? messaging.postback?.mid
      if (!mid) continue
      events.push({
        dedupKey: `msg:${mid}`,
        igAccountId: entry.id,
        kind: 'messaging',
        value: messaging,
      })
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== 'comments') continue
      const commentId: string | undefined = change.value?.id
      if (!commentId) continue
      events.push({
        dedupKey: `comment:${commentId}`,
        igAccountId: entry.id,
        kind: 'comment',
        value: change.value,
      })
    }
  }

  return events
}

export async function enqueue(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) return

  await supabaseAdmin.from('webhook_events').upsert(
    events.map((event) => ({
      dedup_key: event.dedupKey,
      payload: event as unknown as Record<string, unknown>,
      process_after: jitteredProcessAfter(event.kind),
    })),
    { onConflict: 'dedup_key', ignoreDuplicates: true },
  )
}

async function getAccount(igUserId: string): Promise<Account | null> {
  const { data } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('ig_user_id', igUserId)
    .eq('is_active', true)
    .maybeSingle()

  return (data as Account | null) ?? null
}

async function upsertContact(args: {
  account: Account
  igUserId: string
  username?: string | null
  markInbound: boolean
}): Promise<Contact> {
  const { data: existing } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('account_id', args.account.id)
    .eq('ig_user_id', args.igUserId)
    .maybeSingle()

  if (existing) {
    const patch: Record<string, unknown> = {}
    if (args.markInbound) patch.last_inbound_at = new Date().toISOString()
    if (args.username && !(existing as Contact).username) patch.username = args.username

    if (Object.keys(patch).length > 0) {
      const { data: updated } = await supabaseAdmin
        .from('contacts')
        .update(patch)
        .eq('id', (existing as Contact).id)
        .select()
        .single()
      return updated as Contact
    }
    return existing as Contact
  }

  // Perfil só é acessível depois que o contato manda mensagem para a conta.
  const profile = args.markInbound
    ? await fetchContactProfile({
        accessToken: args.account.access_token,
        contactIgId: args.igUserId,
      }).catch(() => null)
    : null

  const { data: created, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      account_id: args.account.id,
      ig_user_id: args.igUserId,
      username: profile?.username ?? args.username ?? null,
      name: profile?.name ?? null,
      last_inbound_at: args.markInbound ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error || !created) throw new Error(`Não consegui criar contato: ${error?.message}`)
  return created as Contact
}

async function loadFlow(flowId: string): Promise<Flow | null> {
  const { data } = await supabaseAdmin.from('flows').select('*').eq('id', flowId).maybeSingle()
  return (data as Flow | null) ?? null
}

async function handleMessaging(account: Account, value: MessagingValue) {
  // Echo = mensagem que a própria conta enviou. Ignorar, senão o bot conversa sozinho.
  if (value.message?.is_echo) return

  const senderId: string | undefined = value.sender?.id
  if (!senderId || senderId === account.ig_user_id) return

  const text: string =
    value.message?.quick_reply?.payload ?? value.postback?.payload ?? value.message?.text ?? ''

  const isStoryReply = Boolean(value.message?.reply_to?.story)
  const contact = await upsertContact({ account, igUserId: senderId, markInbound: true })

  await supabaseAdmin.from('messages').upsert(
    {
      account_id: account.id,
      contact_id: contact.id,
      direction: 'in',
      mid: value.message?.mid ?? value.postback?.mid ?? null,
      text,
      payload: value,
    },
    { onConflict: 'mid', ignoreDuplicates: true },
  )

  if (!text) return

  // Contato em atendimento humano: a mensagem fica registrada para o inbox,
  // mas nenhum fluxo dispara nem retoma por cima da pessoa.
  if (contact.automation_paused) return

  // Fluxo esperando resposta tem prioridade sobre disparar um novo.
  const { data: waiting } = await supabaseAdmin
    .from('flow_runs')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('status', 'waiting_reply')
    .maybeSingle()

  if (waiting) {
    await resumeFlow({ run: waiting as FlowRun, account, contact, input: text })
    return
  }

  const trigger = await findTrigger({
    accountId: account.id,
    type: isStoryReply ? 'story_reply' : 'keyword',
    text,
  })
  if (!trigger) return

  const flow = await loadFlow(trigger.flow_id)
  if (!flow?.is_active) return

  await startFlow({ account, flow, contact, input: text })
}

async function handleComment(account: Account, value: CommentValue) {
  const fromId: string | undefined = value.from?.id
  const commentId: string | undefined = value.id
  const text: string = value.text ?? ''

  if (!fromId || !commentId) return
  // Comentário da própria conta (inclusive a resposta pública que o bot postou).
  if (fromId === account.ig_user_id) return

  const trigger = await findTrigger({
    accountId: account.id,
    type: 'comment',
    text,
    mediaId: value.media?.id,
  })
  if (!trigger) return

  const flow = await loadFlow(trigger.flow_id)
  if (!flow?.is_active) return

  const contact = await upsertContact({
    account,
    igUserId: fromId,
    username: value.from?.username ?? null,
    // Comentário não abre a janela de 24h de DM. Só a private reply passa.
    markInbound: false,
  })

  if (contact.automation_paused) return

  if (trigger.public_reply) {
    try {
      await assertUnderSendCap(account.id)
      await replyToComment({
        accessToken: account.access_token,
        commentId,
        message: spin(trigger.public_reply),
      })
      await logSend(account.id, 'public_reply')
    } catch (error) {
      // Cap ou API fora: perder a resposta pública é aceitável, a DM não.
      console.error('[dm-flow] resposta pública pulada:', error)
    }
  }

  await startFlow({ account, flow, contact, commentId, input: text })
}

/**
 * Pega eventos pendentes e processa. Chamado pelo webhook via after()
 * e pelo cron (que também recolhe o que travou em 'processing').
 */
export async function processPending(limit = 20): Promise<number> {
  const { data } = await supabaseAdmin
    .from('webhook_events')
    .select('*')
    .eq('status', 'pending')
    .lte('process_after', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)

  const rows = data ?? []
  let processed = 0

  for (const row of rows) {
    // Claim otimista: só processa quem conseguiu virar o status de pending.
    const { data: claimed } = await supabaseAdmin
      .from('webhook_events')
      .update({ status: 'processing', attempts: row.attempts + 1 })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claimed) continue

    const event = row.payload as QueuedEvent

    try {
      const account = await getAccount(event.igAccountId)
      if (!account) throw new Error(`Conta ${event.igAccountId} não conectada.`)

      if (event.kind === 'messaging') await handleMessaging(account, event.value)
      else await handleComment(account, event.value)

      await supabaseAdmin
        .from('webhook_events')
        .update({ status: 'done', processed_at: new Date().toISOString(), error: null })
        .eq('id', row.id)
      processed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[dm-flow] evento falhou:', row.dedup_key, message)

      await supabaseAdmin
        .from('webhook_events')
        .update({
          // 3 tentativas antes de desistir.
          status: row.attempts + 1 >= 3 ? 'failed' : 'pending',
          error: message,
        })
        .eq('id', row.id)
    }
  }

  return processed
}
