import type { FlowDefinition } from '@/lib/flow/types'

export type TriggerType = 'keyword' | 'comment' | 'story_reply' | 'default'
export type MatchMode = 'exact' | 'contains' | 'starts_with'
export type RunStatus = 'running' | 'waiting_reply' | 'sleeping' | 'done' | 'failed'
export type MessageDirection = 'in' | 'out'
export type EventStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface Account {
  id: string
  ig_user_id: string
  username: string | null
  access_token: string
  token_expires_at: string
  scopes: string[]
  is_active: boolean
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
  created_at: string
  updated_at: string
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
