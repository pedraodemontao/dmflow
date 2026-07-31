import type { FlowDefinition } from '@/lib/flow/types'

export type TriggerType = 'keyword' | 'comment' | 'story_reply' | 'story_mention' | 'default'
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

/**
 * Pergunta fixa mostrada quando alguém abre o direct com a conta pela
 * primeira vez. `payload` é o que a Meta devolve no toque — casa com uma
 * automação de "palavra na DM" (match_mode exact) que usa o mesmo valor
 * como palavra-chave. Ver `setIceBreakers` em `src/lib/instagram/api.ts`.
 */
export interface IceBreaker {
  question: string
  payload: string
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
  /** Até onde a varredura já chegou. Null = nunca varreu. Ver migration 0009. */
  comments_cursor: string | null
  messages_cursor: string | null
  /** Até 4. O que está publicado ao vivo na Meta pode divergir — ver `ice_breakers_synced_at`. */
  ice_breakers: IceBreaker[]
  /** Última publicação bem-sucedida via `setIceBreakers`. Null = nunca publicado. */
  ice_breakers_synced_at: string | null
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
  /**
   * Cache do perfil no Instagram (ver `fetchContactProfile`,
   * `src/lib/instagram/api.ts`, migration 0012). Só existe para quem já
   * mandou DM — comentário sozinho não dá consentimento. `profile_pic_url`
   * é uma URL ASSINADA QUE EXPIRA em horas/dias; nunca trate como permanente.
   * `profile_synced_at` marca quando foi buscado pela última vez — é o que
   * decide se vale revalidar de novo. Opcionais porque contatos de antes da
   * migration 0012 (ou fixtures de teste fora do escopo desta mudança) não
   * têm esses campos preenchidos.
   */
  profile_pic_url?: string | null
  follower_count?: number | null
  is_verified?: boolean
  profile_synced_at?: string | null
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

/**
 * Perfil do nicho que o dono acompanha. A raspagem (Apify) traz os reels
 * deste perfil para a biblioteca de referência. Ver migration 0014.
 */
export interface TrackedProfile {
  id: string
  account_id: string
  /** Sem "@" — é o que a Apify espera e o que evita o mesmo perfil duas vezes. */
  username: string
  /** Rótulo livre do dono. Texto e não enum: o nicho muda mais rápido que o schema. */
  category: string | null
  is_active: boolean
  last_scraped_at: string | null
  /** Régua do outlier: a mediana de views deste perfil, refeita a cada raspagem. */
  median_views: number | null
  created_at: string
}

export interface LibraryItem {
  id: string
  account_id: string
  profile_id: string
  /** Identidade na origem (shortcode). É o que impede duplicar entre raspagens. */
  post_id: string
  url: string
  /**
   * URL ASSINADA QUE EXPIRA — mesma lição de `contacts.profile_pic_url`.
   * Nunca trate como permanente; a tela precisa de fallback visual.
   */
  thumbnail_url: string | null
  caption: string | null
  posted_at: string | null
  views: number | null
  likes: number | null
  comments: number | null
  /** (curtidas + comentários) / views. Ver `src/lib/library/outlier.ts`. */
  engagement: number | null
  /** Quantas vezes passou da mediana do próprio perfil. Null = amostra insuficiente. */
  outlier: number | null
  /** Marcado pelo dono, não vem da raspagem. */
  watched: boolean
  created_at: string
  updated_at: string
}
