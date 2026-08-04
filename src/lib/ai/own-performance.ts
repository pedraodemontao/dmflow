import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * O que os TEUS vídeos ensinam — o bloco que fecha o laço do gerador.
 *
 * A biblioteca modela o conteúdo dos outros e para no play: sabemos que um
 * vídeo do @maxcarrau fez 54× a mediana dele, e nada além disso. Nos próprios
 * posts sabemos o que aconteceu DEPOIS do play, e é aí que mora a única
 * inteligência que nenhum concorrente pode copiar de você.
 *
 * A MÉTRICA NÃO É VIEW. Um vídeo com 50 mil views e três comentários perdeu
 * para um com 5 mil views e cem — o primeiro entreteve, o segundo converteu.
 * Como este projeto existe para transformar comentário em conversa, a régua é
 * **quantos viraram DM por mil views**. Ranquear por view faria o gerador
 * aprender a fazer vídeo popular, que é um objetivo diferente do dono.
 *
 * O QUE ESTE MÓDULO NÃO FAZ, e é deliberado: não conclui a causa. Ele entrega
 * os extremos com os atributos de cada um (duração, gancho, formato, retenção)
 * e deixa a leitura para o modelo. Uma correlação sobre seis vídeos não é
 * evidência de nada — e escrever "vídeos curtos convertem mais" a partir disso
 * plantaria no prompt uma regra inventada, exatamente o que a trava de fato
 * (`build-system-prompt.ts`) existe para impedir.
 */

/** Abaixo disso não há o que comparar: dois pontos não formam padrão. */
export const MIN_POSTS_PARA_APRENDER = 4

/** Quantos extremos de cada lado. Mais que isso vira lista, não contraste. */
const EXTREMOS = 3

export interface OwnPost {
  mediaId: string
  caption: string
  durationSec: number | null
  hookText: string | null
  visualFormat: string | null
  views: number
  /** Contatos que entraram em fluxo por causa deste post. */
  viraramDM: number
  /** Quem virou DM por mil views. A régua — ver o cabeçalho. */
  dmPorMilViews: number
  avgWatchMs: number | null
  skipRate: number | null
  postedAt: string | null
}

export interface OwnPerformance {
  melhores: OwnPost[]
  piores: OwnPost[]
  /** Total de posts com dado suficiente. Abaixo do mínimo, o bloco não é gerado. */
  amostra: number
}

interface InsightRow {
  media_id: string
  views: number | null
  avg_watch_time_ms: number | null
  skip_rate: number | null
  captured_at: string
}

/** Último snapshot por mídia: o retrato mais recente de cada post. */
function latestByMedia(rows: InsightRow[]): Map<string, InsightRow> {
  const porMidia = new Map<string, InsightRow>()
  for (const row of rows) {
    const atual = porMidia.get(row.media_id)
    if (!atual || row.captured_at > atual.captured_at) porMidia.set(row.media_id, row)
  }
  return porMidia
}

/**
 * Monta o retrato de desempenho próprio.
 *
 * Devolve `null` quando não há amostra — e null aqui é o comportamento certo:
 * o prompt fica sem o bloco em vez de ganhar um bloco vazio pedindo ao modelo
 * que aprenda com nada.
 */
export async function getOwnPerformance(accountId: string): Promise<OwnPerformance | null> {
  const { data: insightRows, error } = await supabaseAdmin
    .from('media_insights')
    .select('media_id, views, avg_watch_time_ms, skip_rate, captured_at')
    .eq('account_id', accountId)

  if (error) {
    console.error('[dm-flow] desempenho próprio indisponível:', error.message)
    return null
  }

  const insights = latestByMedia((insightRows ?? []) as InsightRow[])
  if (insights.size === 0) return null

  // Quantos contatos entraram em fluxo por post.
  //
  // O formato do payload importa e não é o óbvio: o evento guarda tudo dentro
  // de `value`, com o post em `value.media.id` e o autor em `value.from.id`.
  // A primeira versão leu `payload.media_id` e contou zero em tudo — número
  // que parece resultado ("nenhum converteu") quando na verdade é bug.
  const { data: eventos } = await supabaseAdmin
    .from('webhook_events')
    .select('payload')
    .eq('status', 'done')

  interface CommentValue {
    from?: { id?: string }
    media?: { id?: string }
  }

  const dmPorMidia = new Map<string, Set<string>>()
  for (const row of (eventos ?? []) as Array<{ payload: { kind?: string; value?: CommentValue } }>) {
    if (row.payload?.kind !== 'comment') continue
    const mediaId = row.payload.value?.media?.id
    const from = row.payload.value?.from?.id
    if (!mediaId || !from) continue
    if (!dmPorMidia.has(mediaId)) dmPorMidia.set(mediaId, new Set())
    dmPorMidia.get(mediaId)!.add(from)
  }

  // A legenda e a análise vêm da biblioteca, onde os próprios posts foram
  // sincronizados (`sync-own.ts`). Sem isso o bloco teria número sem conteúdo,
  // e número sem conteúdo não ensina nada a quem escreve roteiro.
  const { data: itens } = await supabaseAdmin
    .from('library_items')
    .select('platform_media_id, caption, duration_sec, hook_text, visual_format, posted_at')
    .eq('account_id', accountId)
    .not('platform_media_id', 'is', null)

  const porMediaId = new Map(
    ((itens ?? []) as Array<{ platform_media_id: string; [k: string]: unknown }>).map((row) => [
      row.platform_media_id,
      row,
    ]),
  )

  const posts: OwnPost[] = []
  for (const [mediaId, insight] of insights) {
    const views = insight.views ?? 0
    // Sem view coletada não dá para calcular a régua, e incluir com zero faria
    // o post parecer o pior de todos por falta de dado — que é diferente de
    // ter ido mal.
    if (views <= 0) continue

    const viraramDM = dmPorMidia.get(mediaId)?.size ?? 0
    const item = porMediaId.get(mediaId)

    posts.push({
      mediaId,
      caption: typeof item?.caption === 'string' ? item.caption : '',
      durationSec: typeof item?.duration_sec === 'number' ? item.duration_sec : null,
      hookText: typeof item?.hook_text === 'string' ? item.hook_text : null,
      visualFormat: typeof item?.visual_format === 'string' ? item.visual_format : null,
      views,
      viraramDM,
      dmPorMilViews: Math.round((viraramDM / views) * 1000 * 10) / 10,
      avgWatchMs: insight.avg_watch_time_ms,
      skipRate: insight.skip_rate,
      postedAt: typeof item?.posted_at === 'string' ? item.posted_at : null,
    })
  }

  if (posts.length < MIN_POSTS_PARA_APRENDER) return null

  const ordenados = [...posts].sort((a, b) => b.dmPorMilViews - a.dmPorMilViews)

  return {
    melhores: ordenados.slice(0, EXTREMOS),
    // De trás para frente e invertido: o pior de todos aparece primeiro na
    // lista de piores, que é a ordem que se lê.
    piores: ordenados.slice(-EXTREMOS).reverse(),
    amostra: posts.length,
  }
}

/** Uma linha por post, no formato que o prompt lê. */
function linha(post: OwnPost): string {
  const partes = [
    `${post.dmPorMilViews} DM/mil views (${post.viraramDM} de ${post.views})`,
    post.durationSec ? `${post.durationSec}s` : null,
    post.avgWatchMs ? `assistiram ${Math.round(post.avgWatchMs / 1000)}s em média` : null,
    post.skipRate !== null ? `${post.skipRate}% pularam` : null,
    post.visualFormat,
  ].filter(Boolean)

  const abertura = post.hookText
    ? `gancho: "${post.hookText.slice(0, 120)}"`
    : `legenda: "${post.caption.slice(0, 120)}"`

  return `- ${partes.join(' · ')}\n  ${abertura}`
}

/**
 * O bloco que entra no prompt do gerador.
 *
 * Note que ele NÃO conclui nada: entrega os dois extremos e manda o modelo
 * olhar a diferença. Concluir aqui, com uma amostra de meia dúzia, produziria
 * uma regra confiante e provavelmente falsa — e o gerador trataria essa regra
 * como verdade em todo roteiro seguinte.
 */
export function buildOwnPerformanceBlock(performance: OwnPerformance): string {
  return `# O QUE JÁ FUNCIONOU COM A AUDIÊNCIA DELE (dado próprio, ${performance.amostra} vídeos medidos)
A régua aqui é QUANTOS VIRARAM CONVERSA por mil views, não alcance: vídeo popular que não gera DM não serve ao objetivo dele.

## Os que mais converteram
${performance.melhores.map(linha).join('\n')}

## Os que menos converteram
${performance.piores.map(linha).join('\n')}

Olhe a diferença entre os dois grupos — duração, tipo de gancho, formato, quanto assistiram — e puxe o roteiro na direção do primeiro grupo. Se a amostra não mostrar diferença clara, ignore este bloco em vez de forçar um padrão: meia dúzia de vídeos não prova tendência.`
}
