import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Account, Contact, Flow, Trigger } from '@/types/db'

/**
 * Uma "automação" na UI é o par trigger + flow — a mesma ideia do ManyChat,
 * onde você escolhe o gatilho e desenha o que acontece depois.
 */
export interface Automation {
  trigger: Trigger
  flow: Flow
  stats: { runs: number; done: number }
}

export async function getAccount(): Promise<Account | null> {
  const { data } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  return (data as Account | null) ?? null
}

export async function getAutomations(): Promise<Automation[]> {
  const [{ data: triggers }, { data: flows }, { data: runs }] = await Promise.all([
    supabaseAdmin.from('triggers').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('flows').select('*'),
    supabaseAdmin.from('flow_runs').select('flow_id, status'),
  ])

  const flowById = new Map((flows ?? []).map((f) => [f.id, f as Flow]))

  return ((triggers ?? []) as Trigger[]).flatMap((trigger) => {
    const flow = flowById.get(trigger.flow_id)
    if (!flow) return []

    const mine = (runs ?? []).filter((r) => r.flow_id === flow.id)
    return [
      {
        trigger,
        flow,
        stats: { runs: mine.length, done: mine.filter((r) => r.status === 'done').length },
      },
    ]
  })
}

export async function getAutomation(triggerId: string): Promise<Automation | null> {
  const { data: trigger } = await supabaseAdmin
    .from('triggers')
    .select('*')
    .eq('id', triggerId)
    .maybeSingle()

  if (!trigger) return null

  const { data: flow } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('id', (trigger as Trigger).flow_id)
    .maybeSingle()

  if (!flow) return null

  const { data: runs } = await supabaseAdmin
    .from('flow_runs')
    .select('status')
    .eq('flow_id', (flow as Flow).id)

  return {
    trigger: trigger as Trigger,
    flow: flow as Flow,
    stats: {
      runs: runs?.length ?? 0,
      done: runs?.filter((r) => r.status === 'done').length ?? 0,
    },
  }
}

export interface DashboardStats {
  contacts: number
  automations: number
  activeAutomations: number
  messagesSent: number
  runsRunning: number
}

export async function getStats(): Promise<DashboardStats> {
  const [contacts, triggers, activeTriggers, sent, running] = await Promise.all([
    supabaseAdmin.from('contacts').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('triggers').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('triggers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'out'),
    supabaseAdmin
      .from('flow_runs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['running', 'waiting_reply', 'sleeping']),
  ])

  return {
    contacts: contacts.count ?? 0,
    automations: triggers.count ?? 0,
    activeAutomations: activeTriggers.count ?? 0,
    messagesSent: sent.count ?? 0,
    runsRunning: running.count ?? 0,
  }
}

const DM_WINDOW_MS = 24 * 60 * 60 * 1000

/** `windowOpen` é calculado aqui para a página não precisar de relógio no render. */
export type ContactRow = Contact & { windowOpen: boolean }

export async function getContacts(
  options: { search?: string; tag?: string; limit?: number } = {},
): Promise<ContactRow[]> {
  let query = supabaseAdmin.from('contacts').select('*')

  const search = options.search?.trim()
  if (search) {
    // `,` separa os OR do PostgREST, então vírgula na busca quebraria a query.
    const safe = search.replace(/[,()]/g, ' ').trim()
    if (safe) query = query.or(`username.ilike.%${safe}%,name.ilike.%${safe}%`)
  }

  if (options.tag) query = query.contains('tags', [options.tag])

  const { data } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(options.limit ?? 100)

  const now = Date.now()
  return ((data ?? []) as Contact[]).map((contact) => ({
    ...contact,
    windowOpen: contact.last_inbound_at
      ? now - new Date(contact.last_inbound_at).getTime() < DM_WINDOW_MS
      : false,
  }))
}

/** Todas as etiquetas em uso, para o filtro da lista. */
export async function getAllTags(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('contacts').select('tags')
  const tags = new Set<string>()
  for (const row of (data ?? []) as Array<{ tags: string[] }>) {
    for (const tag of row.tags ?? []) tags.add(tag)
  }
  return [...tags].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export interface ContactDetail {
  contact: ContactRow
  messages: ThreadMessage[]
  runs: Array<{ id: string; status: string; created_at: string; flowName: string }>
}

export async function getContactDetail(contactId: string): Promise<ContactDetail | null> {
  const thread = await getThread(contactId, 30)
  if (!thread) return null

  const { data: runs } = await supabaseAdmin
    .from('flow_runs')
    .select('id, status, created_at, flows(name)')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(20)

  return {
    contact: thread.contact,
    messages: thread.messages,
    runs: ((runs ?? []) as unknown as Array<{
      id: string
      status: string
      created_at: string
      flows: { name: string } | null
    }>).map(({ flows, ...rest }) => ({ ...rest, flowName: flows?.name ?? 'fluxo removido' })),
  }
}

export interface InboxItem {
  contact: ContactRow
  lastMessage: { text: string | null; direction: 'in' | 'out'; created_at: string } | null
}

/**
 * Lista do inbox: contatos ordenados pela última mensagem. A prévia vem de uma
 * segunda query reduzida em memória — o volume é de uso próprio, não vale um
 * lateral join via PostgREST.
 */
export async function getInbox(limit = 50): Promise<InboxItem[]> {
  const { data } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(limit)

  const contacts = (data ?? []) as Contact[]
  if (contacts.length === 0) return []

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('contact_id, text, direction, created_at')
    .in(
      'contact_id',
      contacts.map((c) => c.id),
    )
    .order('created_at', { ascending: false })
    .limit(limit * 6)

  const lastByContact = new Map<string, InboxItem['lastMessage']>()
  for (const message of messages ?? []) {
    if (!message.contact_id || lastByContact.has(message.contact_id)) continue
    lastByContact.set(message.contact_id, {
      text: message.text,
      direction: message.direction,
      created_at: message.created_at,
    })
  }

  const now = Date.now()
  return contacts.map((contact) => ({
    contact: {
      ...contact,
      windowOpen: contact.last_inbound_at
        ? now - new Date(contact.last_inbound_at).getTime() < DM_WINDOW_MS
        : false,
    },
    lastMessage: lastByContact.get(contact.id) ?? null,
  }))
}

export interface ThreadMessage {
  id: string
  direction: 'in' | 'out'
  text: string | null
  source: 'flow' | 'manual'
  created_at: string
}

export interface Thread {
  contact: ContactRow
  messages: ThreadMessage[]
}

export async function getThread(contactId: string, limit = 100): Promise<Thread | null> {
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .maybeSingle()

  if (!contact) return null

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('id, direction, text, source, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  const row = contact as Contact
  return {
    contact: {
      ...row,
      windowOpen: row.last_inbound_at
        ? Date.now() - new Date(row.last_inbound_at).getTime() < DM_WINDOW_MS
        : false,
    },
    messages: ((messages ?? []) as ThreadMessage[]).slice().reverse(),
  }
}

export interface ConversationRow {
  id: string
  direction: 'in' | 'out'
  text: string | null
  created_at: string
  contact: { username: string | null; ig_user_id: string } | null
}

export async function getRecentMessages(limit = 60): Promise<ConversationRow[]> {
  const { data } = await supabaseAdmin
    .from('messages')
    .select('id, direction, text, created_at, contacts(username, ig_user_id)')
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as Array<
    Omit<ConversationRow, 'contact'> & {
      contacts: { username: string | null; ig_user_id: string } | null
    }
  >).map(({ contacts, ...rest }) => ({ ...rest, contact: contacts }))
}
