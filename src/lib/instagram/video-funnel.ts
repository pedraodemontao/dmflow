import { supabaseAdmin } from '@/lib/supabase/admin'
import type { MediaInsight } from '@/types/db'

export interface FunnelStep {
  key: string
  label: string
  value: number
}

export interface FunnelStepWithDrop extends FunnelStep {
  /** Queda em % em relação ao degrau anterior. Null no primeiro degrau. */
  dropPct: number | null
}

/**
 * Queda percentual degrau a degrau — o degrau que mais perde é a resposta
 * para "o que consertar" (card 02, fase 3). Primeiro degrau nunca tem queda,
 * não há anterior. Degrau anterior em zero não divide: sem gente lá em cima,
 * "queda de X%" não descreve nada, fica null em vez de Infinity ou NaN.
 */
export function computeFunnelDrops(steps: FunnelStep[]): FunnelStepWithDrop[] {
  return steps.map((step, index) => {
    if (index === 0) return { ...step, dropPct: null }
    const previous = steps[index - 1].value
    if (previous <= 0) return { ...step, dropPct: null }
    return { ...step, dropPct: Math.round((1 - step.value / previous) * 100) }
  })
}

/** Último snapshot de insights da mídia — o que o vídeo fez (dado da Meta). */
export async function getLatestMediaInsight(accountId: string, mediaId: string): Promise<MediaInsight | null> {
  const { data, error } = await supabaseAdmin
    .from('media_insights')
    .select('*')
    .eq('account_id', accountId)
    .eq('media_id', mediaId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[dm-flow] insights de mídia indisponíveis:', error.message)
    return null
  }
  return data as MediaInsight | null
}

/**
 * Gente distinta que comentou nesse post, via `webhook_events` — é o único
 * lugar que sabe isso, porque o comentário nem sempre vira contato (a pessoa
 * pode nunca ter mandado DM). Contagem por pessoa, não por comentário: quem
 * comenta duas vezes conta uma. Confirmado por curl contra o banco real em
 * 01/08/2026 que o filtro aninhado `payload->value->media->>id` funciona.
 */
async function countCommenters(mediaId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('webhook_events')
    .select('from_id:payload->value->from->>id')
    .eq('payload->>kind', 'comment')
    .eq('payload->value->media->>id', mediaId)
    .limit(20000)

  if (error) {
    console.error('[dm-flow] contagem de comentários indisponível:', error.message)
    return 0
  }
  const ids = new Set(
    (data ?? []).map((row) => (row as { from_id: string | null }).from_id).filter((id): id is string => !!id),
  )
  return ids.size
}

async function countFlowRunContacts(flowId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.from('flow_runs').select('contact_id').eq('flow_id', flowId).limit(20000)

  if (error) {
    console.error('[dm-flow] contagem de disparos indisponível:', error.message)
    return 0
  }
  return new Set((data ?? []).map((row) => (row as { contact_id: string }).contact_id)).size
}

async function countButtonClickContacts(flowId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('button_clicks')
    .select('contact_id')
    .eq('flow_id', flowId)
    .limit(20000)

  if (error) {
    console.error('[dm-flow] contagem de cliques indisponível:', error.message)
    return 0
  }
  return new Set((data ?? []).map((row) => (row as { contact_id: string }).contact_id)).size
}

/**
 * Quem veio DESTE post e segue a conta. `source_id`/`source_type` são
 * primeiro toque (migration 0005): não pega quem comentou aqui depois de já
 * ter vindo de outro lugar, mas é o que existe sem inventar atribuição nova.
 * `follows_account` nulo (perfil nunca verificado) não entra — nulo não é
 * "não segue" (migration 0015).
 */
async function countFollowersFromMedia(mediaId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'comment')
    .eq('source_id', mediaId)
    .eq('follows_account', true)

  if (error) {
    console.error('[dm-flow] contagem de seguidores indisponível:', error.message)
    return 0
  }
  return count ?? 0
}

/** Views distintas do presente. Tabela é do card 01 (migration 0016) — pode não existir ainda. */
async function countDeliveryOpens(deliveryId: string | null): Promise<number> {
  if (!deliveryId) return 0

  const { data, error } = await supabaseAdmin
    .from('delivery_views')
    .select('contact_id')
    .eq('delivery_id', deliveryId)
    .limit(20000)

  if (error) {
    console.error('[dm-flow] contagem de aberturas do presente indisponível:', error.message)
    return 0
  }
  return new Set(
    (data ?? []).map((row) => (row as { contact_id: string | null }).contact_id).filter((id): id is string => !!id),
  ).size
}

/**
 * O funil que só nós temos (bloco 2 do card): views (Meta) → comentaram →
 * viraram DM → clicaram → seguiram → abriram o presente. "Abriram o
 * presente" só entra quando a automação tem entrega configurada — mostrar
 * zero sem entrega pareceria "ninguém abriu" quando a resposta certa é "não
 * existe presente aqui".
 */
export async function getVideoFunnel(args: {
  flowId: string
  mediaId: string
  deliveryId: string | null
  views: number | null
}): Promise<FunnelStepWithDrop[]> {
  const [comentaram, viraramDM, clicaram, seguiram, abriramPresente] = await Promise.all([
    countCommenters(args.mediaId),
    countFlowRunContacts(args.flowId),
    countButtonClickContacts(args.flowId),
    countFollowersFromMedia(args.mediaId),
    countDeliveryOpens(args.deliveryId),
  ])

  const steps: FunnelStep[] = [
    { key: 'viram', label: 'viram', value: args.views ?? 0 },
    { key: 'comentaram', label: 'comentaram', value: comentaram },
    { key: 'viraram_dm', label: 'viraram DM', value: viraramDM },
    { key: 'clicaram', label: 'clicaram', value: clicaram },
    { key: 'seguiram', label: 'seguiram', value: seguiram },
    ...(args.deliveryId
      ? [{ key: 'abriram_presente', label: 'abriram o presente', value: abriramPresente }]
      : []),
  ]

  return computeFunnelDrops(steps)
}

export interface VideoRankingRow {
  automationId: string
  flowId: string
  mediaId: string
  flowName: string
  views: number | null
  follows: number | null
  comentaram: number
  viraramDM: number
  seguiram: number
  /** % de quem comentou que virou DM. Null sem comentário nenhum — dividir por zero não é 0%. */
  conversaoComentarioDM: number | null
  /** % de quem viu que seguiu. Null sem view nenhuma coletada ainda. */
  conversaoViewSeguidor: number | null
}

interface TriggerFlowRow {
  id: string
  account_id: string
  media_id: string
  flow_id: string
  flows: { name: string; delivery_id: string | null } | { name: string; delivery_id: string | null }[] | null
}

/**
 * Um vídeo com automação, uma linha — é aqui que a decisão de conteúdo
 * acontece (bloco 3 do card). Não filtra por `is_active`: automação pausada
 * ainda tem histórico que vale comparar. Distinto por (conta, mídia): mais de
 * um trigger no mesmo post não vira linha duplicada no ranking.
 */
export async function getVideoRanking(): Promise<VideoRankingRow[]> {
  const { data, error } = await supabaseAdmin
    .from('triggers')
    .select('id, account_id, media_id, flow_id, flows(name, delivery_id)')
    .not('media_id', 'is', null)

  if (error) {
    console.error('[dm-flow] ranking de vídeos indisponível:', error.message)
    return []
  }

  const byMedia = new Map<string, TriggerFlowRow>()
  for (const row of (data ?? []) as unknown as TriggerFlowRow[]) {
    const key = `${row.account_id}:${row.media_id}`
    if (!byMedia.has(key)) byMedia.set(key, row)
  }

  return Promise.all(
    [...byMedia.values()].map(async (row) => {
      const flow = Array.isArray(row.flows) ? row.flows[0] : row.flows
      const [latest, funnel] = await Promise.all([
        getLatestMediaInsight(row.account_id, row.media_id),
        getVideoFunnel({
          flowId: row.flow_id,
          mediaId: row.media_id,
          deliveryId: flow?.delivery_id ?? null,
          views: null, // views entram abaixo, já vieram de `latest`
        }),
      ])

      const byKey = new Map(funnel.map((step) => [step.key, step.value]))
      const comentaram = byKey.get('comentaram') ?? 0
      const viraramDM = byKey.get('viraram_dm') ?? 0
      const seguiram = byKey.get('seguiram') ?? 0
      const views = latest?.views ?? null

      return {
        automationId: row.id,
        flowId: row.flow_id,
        mediaId: row.media_id,
        flowName: flow?.name ?? row.media_id,
        views,
        follows: latest?.follows ?? null,
        comentaram,
        viraramDM,
        seguiram,
        conversaoComentarioDM: comentaram > 0 ? Math.round((viraramDM / comentaram) * 100) : null,
        conversaoViewSeguidor: views && views > 0 ? Math.round((seguiram / views) * 100) : null,
      }
    }),
  )
}
