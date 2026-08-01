/**
 * A orquestração da raspagem — e a resposta ao teto de duração da serverless.
 *
 * O PROBLEMA: 31 perfis levam minutos na Apify. A função que dispara a
 * raspagem roda na Vercel com `maxDuration` (o tick usa 300 s; Server Action
 * NÃO tem teto próprio, herda o da página que a chamou — ver
 * `node_modules/next/dist/docs/.../maxDuration.md`). Esperar a rodada inteira
 * dentro de uma chamada é aposta: quando estoura, a função morre no meio, o
 * dono vê "erro de rede" e o crédito da Apify já foi gasto do mesmo jeito.
 *
 * A SAÍDA, sem inventar infraestrutura: nada aqui precisa lembrar de nada,
 * porque o estado já existe em dois lugares que já existiam.
 *
 *  1. A RODADA vive na Apify. `GET /acts/{ator}/runs/last` responde qual foi a
 *     última e em que pé está. Iniciar numa invocação e coletar em outra não
 *     exige tabela, fila nem cron novo.
 *  2. O CURSOR vive em `tracked_profiles.last_scraped_at`, coluna que a
 *     migration 0014 já criou. "O que falta nesta rodada" é quem tem o carimbo
 *     mais velho que `SCRAPE_STALE_MS`.
 *
 * Com isso, cada chamada trabalha até o orçamento (`budgetMs`, folgado abaixo
 * do teto) e devolve um relatório honesto: o que já gravou e o que falta.
 * Chamar de novo CONTINUA de onde parou — não recomeça, não duplica, não paga
 * duas vezes. É a mesma ideia do tick: fatia pequena, muitas vezes, com o
 * progresso no banco em vez de na memória do processo.
 *
 * O que deliberadamente NÃO se faz: abortar a rodada quando o orçamento acaba.
 * Resultado que a Apify já produziu já foi cobrado; matar a rodada obrigaria a
 * raspar o mesmo perfil de novo, pagando duas vezes pelo mesmo dado.
 */
import {
  fetchDatasetItems,
  getLastRun,
  isRunActive,
  keepRequestedHandles,
  startRun,
  waitForRun,
  type ApifyRun,
} from '@/lib/library/apify'
import { costOfResults, DEFAULT_POSTS_PER_PROFILE } from '@/lib/library/cost'
import { ingestScrapedPosts, recomputeProfileMetrics } from '@/lib/library/ingest'
import { backfillThumbs } from '@/lib/library/thumbs'
import { loadActiveProfiles, type ActiveProfile } from '@/lib/library/profiles'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Perfis por rodada da Apify. Rodada pequena termina rápido e cabe inteira num
 * orçamento curto; rodada de 31 perfis quase nunca cabe. Não custa mais caro:
 * a cobrança é por RESULTADO, não por rodada.
 */
export const SCRAPE_BATCH_PROFILES = 8

/**
 * Orçamento de uma chamada. Conservador de propósito: Server Action herda o
 * `maxDuration` da página, e a página da biblioteca é de outro arquivo — se ela
 * não declarar nada, o teto pode ser bem menor que os 300 s do tick. Melhor
 * devolver "ainda raspando" do que ser morto no meio da gravação. Se a página
 * declarar `export const maxDuration = 300`, dá para subir isto pela entrada
 * da action e cada clique faz mais em uma vez só.
 */
export const SCRAPE_BUDGET_MS = 50_000

/** Antes disso, o perfil não é raspado de novo. Também é a trava do clique repetido. */
export const SCRAPE_STALE_MS = 12 * 60 * 60 * 1000

/** Trava contra laço que gira sozinho, na mesma linha do `MAX_STEPS` do engine. */
const MAX_BATCHES = 6

/** Não vale começar rodada que não dá tempo nem de nascer. */
const START_RESERVE_MS = 8_000

export type ScrapePhase =
  /** Não há perfil ativo — falta importar a lista. */
  | 'sem-perfil'
  /** A rodada continua viva na Apify; é só chamar de novo daqui a pouco. */
  | 'raspando'
  /** Todos os perfis estão dentro da janela de frescor. */
  | 'concluida'
  /** O orçamento da chamada acabou com perfil ainda na fila. */
  | 'orcamento'

export interface ScrapeReport {
  phase: ScrapePhase
  message: string
  runsStarted: number
  /** Resultados que vieram da Apify — é o que ela cobrou. */
  received: number
  inserted: number
  updated: number
  profilesTouched: number
  profilesRemaining: number
  costUsd: number
  errors: string[]
}

/**
 * Quem ainda falta nesta rodada. Puro para poder ser testado: errar aqui é
 * raspar (e pagar por) o mesmo perfil várias vezes no mesmo dia.
 */
export function pickStaleProfiles(args: {
  profiles: ActiveProfile[]
  now: number
  staleMs: number
}): ActiveProfile[] {
  return args.profiles.filter((profile) => {
    if (!profile.last_scraped_at) return true
    const carimbo = new Date(profile.last_scraped_at).getTime()
    if (Number.isNaN(carimbo)) return true
    return args.now - carimbo >= args.staleMs
  })
}

/**
 * Quando o último item entrou no acervo desta conta.
 *
 * É o que diz se a rodada finalizada que está na Apify JÁ foi lida: se o acervo
 * tem item mais novo que o fim da rodada, ela já foi ingerida e reler seria
 * trabalho à toa. Usa `library_items.scraped_at`, que já existe — de novo, sem
 * estado novo.
 */
async function lastIngestAt(accountId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('library_items')
    .select('scraped_at')
    .eq('account_id', accountId)
    .not('scraped_at', 'is', null)
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.scraped_at) return 0

  const carimbo = new Date(data.scraped_at as string).getTime()
  return Number.isNaN(carimbo) ? 0 : carimbo
}

function alreadyIngested(run: ApifyRun, ingestedAt: number): boolean {
  if (!run.finishedAt) return false
  const fim = new Date(run.finishedAt).getTime()
  return !Number.isNaN(fim) && ingestedAt > fim
}

/**
 * Carimba o cursor no INÍCIO da rodada, não no fim.
 *
 * Parece errado e não é: `last_scraped_at` responde "quando pedimos este perfil
 * à Apify". Carimbar só quem devolveu item deixaria perfil privado, apagado ou
 * que a Apify errou preso na fila para sempre — cada clique começaria uma
 * rodada nova pelos mesmos perfis mudos, cobrando de novo. Com o carimbo no
 * início, quem não devolveu nada volta na próxima janela de 12 h, que é a
 * cadência certa.
 */
async function stampRequested(accountId: string, profiles: ActiveProfile[]): Promise<void> {
  const agora = new Date().toISOString()

  await supabaseAdmin
    .from('tracked_profiles')
    .update({ last_scraped_at: agora })
    .eq('account_id', accountId)
    .in(
      'id',
      profiles.map((profile) => profile.id),
    )

  for (const profile of profiles) profile.last_scraped_at = agora
}

export interface ScrapeOptions {
  accountId: string
  postsPerProfile?: number
  batchSize?: number
  budgetMs?: number
}

export async function runLibraryScrape(options: ScrapeOptions): Promise<ScrapeReport> {
  const accountId = options.accountId
  const postsPerProfile = options.postsPerProfile ?? DEFAULT_POSTS_PER_PROFILE
  const batchSize = options.batchSize ?? SCRAPE_BATCH_PROFILES
  const deadlineAt = Date.now() + (options.budgetMs ?? SCRAPE_BUDGET_MS)

  const report: ScrapeReport = {
    phase: 'orcamento',
    message: '',
    runsStarted: 0,
    received: 0,
    inserted: 0,
    updated: 0,
    profilesTouched: 0,
    profilesRemaining: 0,
    costUsd: 0,
    errors: [],
  }

  const profiles = await loadActiveProfiles(accountId)

  if (profiles.length === 0) {
    return {
      ...report,
      phase: 'sem-perfil',
      message: 'Nenhum perfil acompanhado. Importe a lista inicial antes de raspar.',
    }
  }

  const tocados = new Set<string>()

  /** Lê o dataset de uma rodada terminada e grava. Nunca lança: parcial > perdido. */
  const collect = async (run: ApifyRun) => {
    try {
      const bruto = await fetchDatasetItems(run.defaultDatasetId, deadlineAt)
      const meus = keepRequestedHandles(
        bruto,
        profiles.map((profile) => profile.username),
      )

      const ingest = await ingestScrapedPosts({
        accountId,
        profiles: profiles.map(({ id, username, category }) => ({ id, username, category })),
        raw: meus,
      })

      report.received += bruto.length
      report.inserted += ingest.inserted
      report.updated += ingest.updated
      report.errors.push(...ingest.errors)
      for (const id of ingest.profileIds) tocados.add(id)

      const recompute = await recomputeProfileMetrics({
        accountId,
        profileIds: ingest.profileIds,
      })
      report.errors.push(...recompute.errors)

      // Guarda a cópia das capas DEPOIS de gravar, nunca antes: a rodada da
      // Apify já foi paga e não pode ficar refém do download de imagem. O que
      // não baixar agora volta na próxima raspagem — a busca só pega quem
      // ainda aponta para fora. Ver `thumbs.ts` para o porquê de não linkar
      // direto (oito de dez capas voltavam 503 no navegador).
      const capas = await backfillThumbs({
        accountId,
        supabaseUrl: process.env.SUPABASE_URL ?? '',
      })
      const falharam = capas.filter((capa) => !capa.ok).length
      if (falharam > 0) report.errors.push(`${falharam} capa(s) não foram guardadas`)
    } catch (error) {
      report.errors.push(
        `coleta da rodada ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  let colhida = false

  for (let volta = 0; volta < MAX_BATCHES; volta += 1) {
    const ultima = await getLastRun(deadlineAt)

    if (ultima && isRunActive(ultima)) {
      const terminada = await waitForRun({ runId: ultima.id, deadlineAt })

      if (!terminada) {
        return finish(report, tocados, profiles, 'raspando')
      }

      await collect(terminada)
      colhida = true
      continue
    }

    // Rodada finalizada que esta invocação ainda não leu — o caso normal de
    // "iniciei antes, voltei agora".
    if (ultima && !colhida && !alreadyIngested(ultima, await lastIngestAt(accountId))) {
      await collect(ultima)
      colhida = true
    }

    const pendentes = pickStaleProfiles({ profiles, now: Date.now(), staleMs: SCRAPE_STALE_MS })
    if (pendentes.length === 0) {
      return finish(report, tocados, profiles, 'concluida')
    }

    if (Date.now() + START_RESERVE_MS >= deadlineAt) {
      return finish(report, tocados, profiles, 'orcamento')
    }

    const lote = pendentes.slice(0, batchSize)

    try {
      // Confere de novo, colado ao disparo: dois cliques quase simultâneos
      // veriam os dois "sem rodada ativa" lá em cima e pagariam duas rodadas.
      const agora = await getLastRun(deadlineAt)
      if (agora && isRunActive(agora)) continue

      await startRun({
        handles: lote.map((profile) => profile.username),
        resultsLimit: postsPerProfile,
        deadlineAt,
      })

      await stampRequested(accountId, lote)
      report.runsStarted += 1
      colhida = false
    } catch (error) {
      report.errors.push(
        `início da rodada: ${error instanceof Error ? error.message : String(error)}`,
      )
      return finish(report, tocados, profiles, 'orcamento')
    }
  }

  return finish(report, tocados, profiles, 'orcamento')
}

function finish(
  report: ScrapeReport,
  tocados: Set<string>,
  profiles: ActiveProfile[],
  phase: ScrapePhase,
): ScrapeReport {
  const restantes = pickStaleProfiles({
    profiles,
    now: Date.now(),
    staleMs: SCRAPE_STALE_MS,
  }).length

  const mensagens: Record<ScrapePhase, string> = {
    'sem-perfil': 'Nenhum perfil acompanhado. Importe a lista inicial antes de raspar.',
    // "Faltam 0 perfis" enquanto uma rodada está no ar é a frase que fez o
    // dono achar que nada tinha acontecido em 01/08/2026: a rodada TINHA
    // começado, mas a Apify leva 1 a 2 minutos e o orçamento da nossa chamada
    // é de 50 segundos. Zero na fila não significa "nada a fazer", significa
    // "nada mais a COMEÇAR — o que falta é esperar".
    raspando:
      restantes === 0
        ? 'A Apify está raspando agora. Leva um a dois minutos: espere e clique de novo para trazer o resultado.'
        : `A Apify está raspando. Ainda faltam ${restantes} perfis — clique de novo em instantes para continuar de onde parou.`,
    concluida:
      restantes === 0 && report.received === 0 && report.runsStarted === 0
        ? 'Tudo já foi raspado nas últimas 12 horas. Nada novo a buscar.'
        : 'Raspagem concluída.',
    orcamento:
      report.errors.length > 0
        ? `Parei com ${restantes} perfis na fila depois de um erro. O que já foi gravado está salvo — clique de novo para continuar.`
        : `Parei no tempo desta chamada com ${restantes} perfis na fila. Clique de novo para continuar.`,
  }

  return {
    ...report,
    phase,
    message: mensagens[phase],
    profilesTouched: tocados.size,
    profilesRemaining: restantes,
    costUsd: costOfResults(report.received),
  }
}
