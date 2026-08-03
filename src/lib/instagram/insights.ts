import { fetchMedia } from '@/lib/instagram/api'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { MediaInsight } from '@/types/db'

const GRAPH = 'https://graph.instagram.com/v23.0'

/**
 * Nome da métrica na Graph API -> coluna em `media_insights` (migration 0017).
 * `navigation` existe na API mas não tem coluna própria: não faz parte dos
 * três blocos da tela do card, então não é coletada.
 */
const METRIC_COLUMN = {
  views: 'views',
  reach: 'reach',
  follows: 'follows',
  profile_visits: 'profile_visits',
  total_interactions: 'total_interactions',
  saved: 'saved',
  shares: 'shares',
  link_clicks: 'link_clicks',
  ig_reels_avg_watch_time: 'avg_watch_time_ms',
  ig_reels_video_view_total_time: 'total_watch_time_ms',
  reels_skip_rate: 'skip_rate',
} as const

type MetricName = keyof typeof METRIC_COLUMN
type ColumnName = (typeof METRIC_COLUMN)[MetricName]

const ALL_METRICS = Object.keys(METRIC_COLUMN) as MetricName[]
const COLUMNS = Object.values(METRIC_COLUMN) as ColumnName[]

export type MediaInsightsSnapshot = Record<ColumnName, number | null>

interface InsightDatum {
  name: string
  values?: Array<{ value: number }>
}

async function requestInsights(mediaId: string, accessToken: string, metrics: MetricName[]) {
  const params = new URLSearchParams({ metric: metrics.join(','), access_token: accessToken })
  const res = await fetch(`${GRAPH}/${mediaId}/insights?${params}`)
  const json = (await res.json().catch(() => ({}))) as {
    data?: InsightDatum[]
    error?: { message?: string }
  }
  return { ok: res.ok, json }
}

function toSnapshot(data: InsightDatum[]): MediaInsightsSnapshot {
  const byName = new Map(data.map((d) => [d.name, d.values?.[0]?.value ?? null]))
  const snapshot = {} as MediaInsightsSnapshot
  for (const [metric, column] of Object.entries(METRIC_COLUMN) as [MetricName, ColumnName][]) {
    snapshot[column] = byName.has(metric) ? (byName.get(metric) as number) : null
  }
  return snapshot
}

/**
 * Insights de uma mídia, pedidos em lote. A Meta recusa a CHAMADA INTEIRA
 * quando uma métrica não vale para o tipo daquela mídia — confirmado por curl
 * contra a conta real em 01/08/2026: todo REELS da conta (100% do conteúdo
 * hoje) recusa `follows`, `profile_visits` e `link_clicks`.
 *
 * A Meta reporta isso EM ESTÁGIOS, não tudo de uma vez: pedindo as 11 juntas,
 * a mensagem de erro cita só `link_clicks` ("not available on this
 * endpoint"); tirando ela, a próxima resposta só então cita `follows,
 * profile_visits` ("does not support ... for this media product type") —
 * confirmado batendo as duas chamadas contra a conta real. Um retry único
 * (tira o que a primeira mensagem citou e para) fica preso no segundo
 * estágio para sempre: teria devolvido erro em toda coleta, de todo Reel,
 * indefinidamente. Por isso é um LOOP, tira as métricas citadas e tenta de
 * novo até a Meta aceitar ou parar de citar métrica nova — sem hardcodar por
 * tipo de mídia, porque um erro genérico (token morto, mídia apagada) não
 * cita métrica nenhuma e não deve virar retry silencioso.
 *
 * Métrica que a Meta OMITE do array `data` (não manda zero) vira `null` —
 * nunca zero, que seria indistinguível de "ninguém viu".
 */
export async function fetchMediaInsights(args: {
  mediaId: string
  accessToken: string
}): Promise<MediaInsightsSnapshot> {
  let metrics = ALL_METRICS
  const dropped: MetricName[] = []

  // Cada volta remove ao menos uma métrica, então o teto de tentativas é o
  // próprio total de métricas — não há como o loop rodar para sempre.
  for (let round = 0; round < ALL_METRICS.length; round++) {
    const attempt = await requestInsights(args.mediaId, args.accessToken, metrics)

    if (attempt.ok) {
      if (dropped.length > 0) {
        console.error(
          `[dm-flow] insights de mídia ${args.mediaId}: Meta recusou ${dropped.join(', ')} para este tipo de mídia, coletado sem elas`,
        )
      }
      return toSnapshot(attempt.json.data ?? [])
    }

    const message = attempt.json.error?.message ?? ''
    const unsupported = metrics.filter((m) => message.includes(m))
    if (unsupported.length === 0) {
      throw new Error(`Insights de mídia falharam (${args.mediaId}): ${message || 'resposta sem corpo'}`)
    }

    metrics = metrics.filter((m) => !unsupported.includes(m))
    dropped.push(...unsupported)
    if (metrics.length === 0) {
      throw new Error(
        `Insights de mídia falharam (${args.mediaId}): nenhuma métrica sobrou depois de tirar ${dropped.join(', ')}`,
      )
    }
  }

  throw new Error(`Insights de mídia falharam (${args.mediaId}): degradação excedeu o número de métricas`)
}

async function fetchMediaTimestamp(mediaId: string, accessToken: string): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${mediaId}?fields=timestamp&access_token=${accessToken}`)
  if (!res.ok) return null
  const json = (await res.json().catch(() => ({}))) as { timestamp?: string }
  return json.timestamp ?? null
}

interface CollectTarget {
  accountId: string
  mediaId: string
  accessToken: string
}

/**
 * Mídias com automação ligada: `triggers.media_id` é o vínculo post <->
 * automação que já existe — não se inventa outro. Trigger e fluxo têm que
 * estar ativos, e a conta também.
 */
/**
 * Os posts RECENTES da conta, tenham automação ou não.
 *
 * POR QUE ISTO EXISTE: a seleção por gatilho abaixo só enxerga post com
 * automação daquele `media_id` específico. Gatilho de "qualquer post"
 * (`media_id` nulo) — que é o mais usado aqui — não produz alvo nenhum, então
 * um vídeo publicado hoje ficaria sem uma única medição.
 *
 * E medir tarde é quase tão ruim quanto não medir: o valor desta tabela é a
 * SÉRIE (ver migration 0017 — "quantas views tinha quando liguei a
 * automação"), e série que começa no terceiro dia perdeu justamente o pico,
 * que é onde o post decide o que vai ser.
 */
async function recentMediaTargets(): Promise<CollectTarget[]> {
  const { data } = await supabaseAdmin
    .from('accounts')
    .select('id, ig_user_id, access_token')
    .eq('is_active', true)

  const targets: CollectTarget[] = []

  for (const account of (data ?? []) as Array<{
    id: string
    ig_user_id: string
    access_token: string
  }>) {
    try {
      // Poucos: o teto de coleta por hora já protege o orçamento, e post
      // antigo não muda o suficiente para pagar uma chamada por tick.
      const media = await fetchMedia({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        limit: 10,
      })
      for (const item of media) {
        targets.push({
          accountId: account.id,
          mediaId: item.id,
          accessToken: account.access_token,
        })
      }
    } catch (error) {
      // Uma conta que não responde não pode calar a coleta das outras nem
      // derrubar o tick — métrica é acessório, entrega não.
      console.error('[dm-flow] não listei as mídias recentes:', String(error).slice(0, 120))
    }
  }

  return targets
}

async function activeMediaTargets(): Promise<CollectTarget[]> {
  const { data } = await supabaseAdmin
    .from('triggers')
    .select('account_id, media_id, flows!inner(is_active), accounts!inner(is_active, access_token)')
    .eq('is_active', true)
    .eq('flows.is_active', true)
    .eq('accounts.is_active', true)
    .not('media_id', 'is', null)

  type Row = {
    account_id: string
    media_id: string
    accounts: { access_token: string } | { access_token: string }[]
  }

  const byKey = new Map<string, CollectTarget>()
  for (const row of (data ?? []) as unknown as Row[]) {
    const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts
    if (!account) continue

    const key = `${row.account_id}:${row.media_id}`
    if (!byKey.has(key)) {
      byKey.set(key, { accountId: row.account_id, mediaId: row.media_id, accessToken: account.access_token })
    }
  }
  return Array.from(byKey.values())
}

async function lastSnapshots(accountId: string, mediaId: string, limit: number): Promise<MediaInsight[]> {
  const { data } = await supabaseAdmin
    .from('media_insights')
    .select('*')
    .eq('account_id', accountId)
    .eq('media_id', mediaId)
    .order('captured_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as MediaInsight[]
}

function snapshotsEqual(a: MediaInsight, b: MediaInsight): boolean {
  return COLUMNS.every((column) => a[column] === b[column])
}

const HOURLY_GAP_MS = 60 * 60 * 1000
const STABLE_POST_AGE_MS = 30 * 24 * 60 * 60 * 1000
const STABLE_POST_GAP_MS = 24 * 60 * 60 * 1000

/**
 * Uma coleta por mídia por hora, no máximo. Post com mais de 30 dias e as
 * duas últimas coletas idênticas espaça para 1x/dia — o post parou de mudar,
 * e chamada de API é orçamento que a entrega precisa mais que a métrica. A
 * idade só é checada quando já parece estabilizado, para não gastar chamada
 * à toa em mídia que ainda está variando.
 */
export async function shouldCollect(target: CollectTarget): Promise<boolean> {
  const recent = await lastSnapshots(target.accountId, target.mediaId, 2)
  const last = recent[0]
  if (!last) return true

  const sinceLastMs = Date.now() - new Date(last.captured_at).getTime()
  if (sinceLastMs < HOURLY_GAP_MS) return false

  const stabilized = recent.length === 2 && snapshotsEqual(recent[0], recent[1])
  if (!stabilized) return true
  if (sinceLastMs >= STABLE_POST_GAP_MS) return true

  const timestamp = await fetchMediaTimestamp(target.mediaId, target.accessToken)
  const ageMs = timestamp ? Date.now() - new Date(timestamp).getTime() : 0
  return ageMs <= STABLE_POST_AGE_MS
}

/**
 * Roda no tick, depois do que já existe. NUNCA pode derrubar o tick: erro
 * aqui é console.error, o 503 é exclusivo do polling (única coisa que avisa
 * que a automação parou de verdade).
 */
export async function collectMediaInsights(): Promise<{ collected: number; skipped: number }> {
  // As duas fontes se somam: o post com automação própria continua sendo
  // coletado mesmo quando sai das dez mais recentes, e o post novo passa a ser
  // coletado desde a primeira hora mesmo sem automação própria.
  const [porGatilho, recentes] = await Promise.all([activeMediaTargets(), recentMediaTargets()])
  const porChave = new Map<string, CollectTarget>()
  for (const alvo of [...porGatilho, ...recentes]) {
    porChave.set(`${alvo.accountId}:${alvo.mediaId}`, alvo)
  }
  const targets = [...porChave.values()]
  let collected = 0
  let skipped = 0

  for (const target of targets) {
    try {
      if (!(await shouldCollect(target))) {
        skipped += 1
        continue
      }

      const snapshot = await fetchMediaInsights({ mediaId: target.mediaId, accessToken: target.accessToken })
      const { error } = await supabaseAdmin.from('media_insights').insert({
        account_id: target.accountId,
        media_id: target.mediaId,
        ...snapshot,
      })
      if (error) throw error
      collected += 1
    } catch (error) {
      console.error(`[dm-flow] coleta de insights falhou (${target.mediaId}):`, error)
    }
  }

  return { collected, skipped }
}
