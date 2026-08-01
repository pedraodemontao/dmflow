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
  /**
   * Segue a conta? NULO = ainda não deu para verificar (só comentou, e
   * comentário não dá consentimento de perfil). NUNCA trate nulo como falso —
   * barraria quem segue. Ver migration 0015.
   */
  follows_account?: boolean | null
  follows_checked_at?: string | null
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

export type FunnelStageKey = 'topo' | 'meio' | 'fundo'
export type LibrarySource = 'instagram' | 'youtube' | 'manual'

/**
 * A parametrização do gerador de roteiro. Voz, proibições e formato vivem
 * aqui e NÃO no código — é o que permite trocar de nicho editando linhas em
 * vez de reescrever o gerador. Ver migration 0014.
 */
export interface Persona {
  id: string
  account_id: string
  name: string
  niche: string
  voice_prompt: string
  forbidden_rules: string[]
  format_rules: string
  named_mechanisms: unknown
  recording_guidance: string
  headline_formula: string
  offer: string
  /** A palavra que o lead comenta — liga a biblioteca ao resto do produto. */
  cta_keyword: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FunnelStage {
  id: string
  account_id: string
  persona_id: string
  key: FunnelStageKey
  label: string
  cta_instruction: string
  sort_order: number
  created_at: string
}

export interface ContentPillar {
  id: string
  account_id: string
  persona_id: string
  name: string
  description: string
  default_funnel_stage: FunnelStageKey | null
  sort_order: number
  created_at: string
}

/** Perfil do nicho que a raspagem acompanha. */
export interface TrackedProfile {
  id: string
  account_id: string
  /** Sem "@" — é o que a Apify espera e o que evita duplicar o perfil. */
  username: string
  category: string | null
  is_active: boolean
  last_scraped_at: string | null
  /** Régua do outlier: mediana de PLAYS deste perfil, refeita a cada raspagem. */
  median_plays: number | null
  created_at: string
}

export interface LibraryItem {
  id: string
  account_id: string
  persona_id: string | null
  profile_id: string | null
  source: LibrarySource
  owner_handle: string | null
  category: string | null
  post_type: string | null
  external_url: string
  /**
   * URL ASSINADA QUE EXPIRA — mesma lição de `contacts.profile_pic_url`.
   * A tela precisa de fallback visual.
   */
  thumb_url: string | null
  /** Contagem restrita. Guardada para auditoria; não é a régua do outlier. */
  views: number
  /** O número que aparece publicamente no reel. É sobre ele que o outlier é calculado. */
  plays: number
  likes: number
  comments: number
  duration_sec: number | null
  caption: string
  posted_at: string | null
  /** Vem do enriquecimento por IA, não da raspagem: é o que torna o vídeo modelável. */
  visual_format: string | null
  format_desc: string | null
  hook_text: string | null
  structure: string | null
  engagement: number | null
  /** Quantas vezes passou da mediana do próprio perfil. Null = amostra insuficiente. */
  outlier: number | null
  watched: boolean
  scraped_at: string | null
  created_at: string
  updated_at: string
}

export interface Script {
  id: string
  account_id: string
  persona_id: string | null
  pillar_id: string | null
  funnel_stage: FunnelStageKey | null
  theme: string | null
  duration: string | null
  source_library_item_id: string | null
  output: unknown
  model_used: string | null
  tokens_in: number | null
  tokens_out: number | null
  created_at: string
}
