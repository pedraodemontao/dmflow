import type { FlowDefinition } from '@/lib/flow/types'

export type TriggerType = 'keyword' | 'comment' | 'story_reply' | 'default'
export type MatchMode = 'exact' | 'contains' | 'starts_with'
export type RunStatus = 'running' | 'waiting_reply' | 'sleeping' | 'done' | 'failed'
export type MessageDirection = 'in' | 'out'
export type EventStatus = 'pending' | 'processing' | 'done' | 'failed'
export type InboxStatus = 'open' | 'snoozed' | 'done'

export interface CannedReply {
  id: string
  account_id: string
  title: string
  text: string
  created_at: string
}

export interface Account {
  id: string
  ig_user_id: string
  username: string | null
  access_token: string
  token_expires_at: string
  scopes: string[]
  is_active: boolean
  /** Botão de pânico: nenhuma automação dispara enquanto true. */
  automations_paused: boolean
  /** Silêncio noturno em hora cheia (America/Sao_Paulo). Null = sempre ativo. */
  quiet_from: number | null
  quiet_to: number | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  account_id: string
  ig_user_id: string
  username: string | null
  name: string | null
  tags: string[]
  fields: Record<string, unknown>
  last_inbound_at: string | null
  subscribed: boolean
  automation_paused: boolean
  last_message_at: string | null
  unread_count: number
  /** Primeiro toque: de onde a pessoa veio. Ver migration 0005. */
  source_type: 'comment' | 'ref' | 'ad' | null
  source_id: string | null
  source_at: string | null
  inbox_status: InboxStatus
  snooze_until: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type MessageSource = 'flow' | 'manual'

export interface Message {
  id: string
  account_id: string
  contact_id: string | null
  direction: MessageDirection
  mid: string | null
  text: string | null
  source: MessageSource
  created_at: string
}

export interface Flow {
  id: string
  account_id: string
  name: string
  definition: FlowDefinition
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Trigger {
  id: string
  account_id: string
  flow_id: string
  type: TriggerType
  keywords: string[]
  match_mode: MatchMode
  media_id: string | null
  public_reply: string | null
  priority: number
  is_active: boolean
  created_at: string
}

export interface FlowRun {
  id: string
  account_id: string
  flow_id: string
  contact_id: string
  current_node: string | null
  status: RunStatus
  resume_at: string | null
  context: Record<string, unknown>
  error: string | null
  created_at: string
  updated_at: string
}
