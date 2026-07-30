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

export async function getContacts(limit = 50): Promise<ContactRow[]> {
  const { data } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  const now = Date.now()
  return ((data ?? []) as Contact[]).map((contact) => ({
    ...contact,
    windowOpen: contact.last_inbound_at
      ? now - new Date(contact.last_inbound_at).getTime() < DM_WINDOW_MS
      : false,
  }))
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
