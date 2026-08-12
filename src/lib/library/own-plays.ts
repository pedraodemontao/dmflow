import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * O número dos PRÓPRIOS vídeos entra na régua da biblioteca.
 *
 * O elo estava aberto: `sync-own.ts` traz os posts do dono com legenda,
 * duração e `platform_media_id`, mas grava `plays = 0` de propósito — a Graph
 * API não devolve contagem em `/me/media`. Quem tem o número é
 * `media_insights`, coletado pelo tick. Só que nada levava esse número de
 * volta para `library_items`, e sem play não há mediana; sem mediana não há
 * outlier; sem outlier o próprio perfil não aparece em nenhuma ordenação da
 * biblioteca e o `analisar-biblioteca.mts` (que filtra por `outlier not null`)
 * nunca escolhe um vídeo do dono. Os 49 posts existiam e eram invisíveis.
 *
 * ATENÇÃO À RÉGUA — a armadilha documentada no CLAUDE.md. A Apify devolve
 * `videoPlayCount` (o número que o reel mostra publicamente) e a Graph devolve
 * `views`; no mesmo vídeo isso deu 112.806 contra 4.719, fator 24. Aqui o
 * `views` da Graph é gravado em `plays` porque **o outlier é uma razão dentro
 * do mesmo perfil**: numerador e denominador saem os dois desta função, então
 * a conta fecha e "3× o normal dele" continua verdade. O que NÃO vale é ler o
 * `plays` do dono ao lado do de um terceiro como se fossem a mesma unidade —
 * comparação absoluta entre perfis já era proibida antes disto (`outlier.ts`),
 * e continua sendo, agora por dois motivos em vez de um.
 *
 * `views` recebe o mesmo valor por ser literalmente o que a Graph mediu. Ficar
 * zerado faria a tela mostrar "0 views" num vídeo com 2.137.
 */

/** O que a metade pura precisa saber de um item da biblioteca. */
export interface OwnItemRow {
  id: string
  profile_id: string | null
  platform_media_id: string | null
  plays: unknown
  views: unknown
}

/** Um snapshot de `media_insights`. Vários por mídia — vence o mais recente. */
export interface InsightSnapshot {
  media_id: string
  views: number | null
  captured_at: string
}

export interface PlaysUpdate {
  id: string
  /** Para quem chama saber qual régua precisa ser recalculada depois da escrita. */
  profileId: string | null
  plays: number
  views: number
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Último snapshot de cada mídia.
 *
 * `media_insights` é histórico por decisão de projeto (migration 0017): cada
 * coleta grava uma linha nova para que se possa perguntar "quantas views tinha
 * quando a automação foi ligada". Para a régua da biblioteca a pergunta é
 * outra — "quanto tem AGORA" —, então aqui só o mais recente sobrevive.
 */
function ultimoPorMidia(snapshots: InsightSnapshot[]): Map<string, InsightSnapshot> {
  const porMidia = new Map<string, InsightSnapshot>()
  for (const row of snapshots) {
    const atual = porMidia.get(row.media_id)
    if (!atual || row.captured_at > atual.captured_at) porMidia.set(row.media_id, row)
  }
  return porMidia
}

/**
 * Metade pura: quais itens precisam de escrita, e com que número.
 *
 * Devolve SÓ o que muda. Item sem insight coletado fica de fora em vez de ser
 * zerado — zerar apagaria um número que já estava certo se a coleta falhar uma
 * vez, e `media_insights` depende da Graph API responder.
 */
export function playsFromInsights(args: {
  items: OwnItemRow[]
  snapshots: InsightSnapshot[]
}): PlaysUpdate[] {
  const porMidia = ultimoPorMidia(args.snapshots)
  const updates: PlaysUpdate[] = []

  for (const item of args.items) {
    if (!item.platform_media_id) continue

    const insight = porMidia.get(item.platform_media_id)
    const views = insight?.views ?? 0
    if (views <= 0) continue

    if (toNumber(item.plays) === views && toNumber(item.views) === views) continue

    updates.push({ id: item.id, profileId: item.profile_id ?? null, plays: views, views })
  }

  return updates
}

export interface SyncOwnPlaysResult {
  /** Itens do dono com vínculo de mídia — o universo possível. */
  vinculados: number
  atualizados: number
  /** Quantos não têm insight na janela. Post antigo nunca terá: a Graph não dá retroativo. */
  semInsight: number
  /** Perfis cuja régua mudou. Vazio quando nada foi escrito — e aí não há o que recalcular. */
  perfis: string[]
}

/**
 * Janela de snapshots lidos.
 *
 * `media_insights` é histórico por decisão de projeto — uma linha por coleta,
 * para sempre. Esta função roda a CADA TICK, ou seja, de minuto em minuto:
 * varrer a tabela inteira funciona hoje, com duzentas linhas, e vira leitura de
 * dezenas de milhares daqui a alguns meses, por um resultado que só precisa do
 * snapshot mais recente de cada mídia.
 *
 * Trinta dias é folgado de sobra: uma mídia coletada há mais de um mês já teve
 * seu número gravado em `library_items` na época, e item sem snapshot na janela
 * é PULADO, não zerado — o valor antigo permanece.
 */
const JANELA_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Leva o número de `media_insights` para `library_items`.
 *
 * Roda no tick logo depois da coleta e no script de sincronização. Idempotente
 * por construção: sem mudança, nenhuma escrita.
 */
export async function syncOwnPlaysFromInsights(accountId: string): Promise<SyncOwnPlaysResult> {
  const { data: itens, error: itensError } = await supabaseAdmin
    .from('library_items')
    .select('id, profile_id, platform_media_id, plays, views')
    .eq('account_id', accountId)
    .not('platform_media_id', 'is', null)

  if (itensError) throw new Error(`itens do dono: ${itensError.message}`)

  const items = (itens ?? []) as OwnItemRow[]
  if (items.length === 0) return { vinculados: 0, atualizados: 0, semInsight: 0, perfis: [] }

  const { data: snaps, error: snapsError } = await supabaseAdmin
    .from('media_insights')
    .select('media_id, views, captured_at')
    .eq('account_id', accountId)
    .gte('captured_at', new Date(Date.now() - JANELA_MS).toISOString())

  if (snapsError) throw new Error(`insights: ${snapsError.message}`)

  const snapshots = (snaps ?? []) as InsightSnapshot[]
  const updates = playsFromInsights({ items, snapshots })

  for (const update of updates) {
    const { error } = await supabaseAdmin
      .from('library_items')
      .update({ plays: update.plays, views: update.views })
      .eq('id', update.id)
      .eq('account_id', accountId)

    if (error) throw new Error(`play do item ${update.id}: ${error.message}`)
  }

  const comInsight = new Set(
    snapshots.filter((row) => (row.views ?? 0) > 0).map((row) => row.media_id),
  )

  return {
    vinculados: items.length,
    atualizados: updates.length,
    semInsight: items.filter((item) => !comInsight.has(item.platform_media_id ?? '')).length,
    perfis: [...new Set(updates.map((update) => update.profileId).filter((id): id is string => !!id))],
  }
}
