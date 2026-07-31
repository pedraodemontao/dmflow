/**
 * Cliente da Apify — quem de fato raspa o Instagram.
 *
 * PORTE de `scripts/scrape-library.mjs` do projeto `paInel-nocode-pedro`, onde
 * o pipeline já rodou de verdade. A mecânica preservada (ator, polling,
 * retentativa com espera crescente, filtro por handle) nasceu de problema real,
 * não de gosto — cada uma está comentada abaixo.
 *
 * O QUE MUDA NO NOSSO CONTEXTO: lá era um processo Node de linha de comando,
 * que podia esperar 18 minutos sem incomodar ninguém. Aqui isso roda numa
 * função serverless da Vercel, com teto de duração (`maxDuration`; o tick usa
 * 300 s e Server Action herda o teto da PÁGINA que a chamou, não tem teto
 * próprio). Uma raspagem de 31 perfis leva minutos e estouraria.
 *
 * A saída é não esperar dentro de uma chamada só: a rodada da Apify vira
 * ESTADO DURÁVEL na própria Apify. `GET /acts/{ator}/runs/last` responde qual
 * foi a última rodada e em que pé ela está, então a função pode iniciar numa
 * invocação e coletar em outra sem tabela nova, sem fila nova e sem
 * infraestrutura nova. Quem orquestra isso é `scrape.ts`; aqui só existem as
 * peças. Toda chamada recebe um `deadlineAt` (instante absoluto) e desiste
 * educadamente antes do teto em vez de ser morta no meio.
 *
 * O token vai no cabeçalho `Authorization`, e não no `?token=` da URL como no
 * script original: as mensagens de erro daqui carregam a URL, e URL com token
 * dentro vira segredo em log da Vercel.
 */
import { z } from 'zod'

const APIFY_API = 'https://api.apify.com/v2'

/** O mesmo ator do script original. */
export const APIFY_ACTOR = 'apify~instagram-scraper'

/** Teto por requisição isolada. A rodada demora; a chamada HTTP não. */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * Retentativa com espera CRESCENTE (3 s, 6 s, 9 s…).
 *
 * Comentário do original, mantido porque continua verdadeiro: "Apify às vezes
 * dá connect-timeout transitório". Perder a rodada inteira por causa de um
 * soquete que caiu seria trocar dólares por centavos — a rodada já foi paga.
 */
const RETRY_TRIES = 5
const RETRY_STEP_MS = 3_000

/** Intervalo do polling de status. O original usava 14 s; aqui o orçamento é curto. */
const POLL_INTERVAL_MS = 5_000

/**
 * Teto da rodada na Apify, em segundos. Rodada travada continua consumindo
 * crédito de um plano grátis de US$ 5/mês; melhor ela morrer sozinha.
 */
const RUN_TIMEOUT_SECS = 900

export class ApifyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ApifyError'
  }
}

/**
 * O token fica aqui, e não em `src/lib/env.ts`, de propósito: `env` valida o
 * conjunto todo de uma vez e é obrigatório para o app subir. A raspagem é
 * opcional — quem nunca abrir a biblioteca não precisa de conta na Apify, e o
 * painel não pode deixar de carregar por causa disso. Quando a variável virar
 * requisito do produto, mova para o schema de `env.ts`, que é a lista oficial.
 */
function apifyToken(): string {
  const parsed = z.string().min(1).safeParse(process.env.APIFY_TOKEN)
  if (!parsed.success) {
    throw new ApifyError('APIFY_TOKEN não está configurada — a raspagem precisa dela.')
  }
  return parsed.data
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Estados em que a rodada ainda pode mudar de ideia. Não se inicia outra por cima. */
const ACTIVE_STATUSES = new Set(['READY', 'RUNNING', 'ABORTING', 'TIMING-OUT'])

const runSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  defaultDatasetId: z.string().min(1),
  startedAt: z.string().nullish(),
  finishedAt: z.string().nullish(),
})

export type ApifyRun = z.infer<typeof runSchema>

export function isRunActive(run: ApifyRun | null): boolean {
  return run !== null && ACTIVE_STATUSES.has(run.status)
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  deadlineAt: number
}

/**
 * Uma requisição à Apify, com retentativa em falha de rede e em 5xx/429.
 *
 * 4xx que não seja 429 volta como resposta: quem chamou é que sabe se um 404
 * é problema (dataset sumido) ou resposta legítima ("nunca houve rodada").
 */
async function apifyRequest(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, deadlineAt } = options

  // O token é resolvido ANTES do laço de propósito: falta de configuração é
  // erro permanente, e insistir nela cinco vezes com espera crescente queimaria
  // 30 s do orçamento da função para chegar na mesma conclusão. Mesma regra que
  // `isPermanentError` aplica no envio da Meta.
  const bearer = `Bearer ${apifyToken()}`

  let lastError: unknown

  for (let attempt = 0; attempt < RETRY_TRIES; attempt += 1) {
    try {
      const response = await fetch(`${APIFY_API}${path}`, {
        method,
        headers: {
          Authorization: bearer,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (response.status === 429 || response.status >= 500) {
        throw new ApifyError(`${method} ${path} -> ${response.status}`)
      }

      return response
    } catch (error) {
      lastError = error
      const wait = RETRY_STEP_MS * (attempt + 1)
      // Não adianta esperar por uma retentativa que o teto da função não deixa
      // acontecer: desiste agora e devolve o controle a quem tem o orçamento.
      if (Date.now() + wait >= deadlineAt) break
      await sleep(wait)
    }
  }

  throw new ApifyError(`Apify não respondeu em ${method} ${path}`, { cause: lastError })
}

async function apifyJson<T>(
  path: string,
  options: RequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await apifyRequest(path, options)

  if (!response.ok) {
    throw new ApifyError(`${options.method ?? 'GET'} ${path} -> ${response.status}`)
  }

  const parsed = schema.safeParse(await response.json())
  if (!parsed.success) {
    throw new ApifyError(`Resposta inesperada da Apify em ${path}: ${parsed.error.message}`)
  }

  return parsed.data
}

/**
 * A última rodada do ator nesta conta da Apify — o "estado durável" que evita
 * criar tabela só para lembrar de um id.
 *
 * `null` quando nunca houve rodada (a Apify responde 404). Como o token é do
 * dono e single-tenant, a última rodada é sempre nossa; se ele disparar o ator
 * por fora, a rodada dele também será coletada — o que é inofensivo, porque a
 * ingestão só aceita item de perfil que já está em `tracked_profiles`.
 */
export async function getLastRun(deadlineAt: number): Promise<ApifyRun | null> {
  const response = await apifyRequest(`/acts/${APIFY_ACTOR}/runs/last`, { deadlineAt })

  if (response.status === 404) return null
  if (!response.ok) throw new ApifyError(`GET runs/last -> ${response.status}`)

  const parsed = z.object({ data: runSchema }).safeParse(await response.json())
  // Lança em vez de devolver `null`: se a Apify mudar o formato, "não consegui
  // ler" viraria "não há rodada" e o orquestrador dispararia uma rodada NOVA
  // por cima da que já está correndo — pagando duas vezes pelos mesmos perfis.
  if (!parsed.success) {
    throw new ApifyError(`Não deu para ler a última rodada: ${parsed.error.message}`)
  }

  return parsed.data.data
}

export async function getRun(runId: string, deadlineAt: number): Promise<ApifyRun> {
  const { data } = await apifyJson(
    `/actor-runs/${runId}`,
    { deadlineAt },
    z.object({ data: runSchema }),
  )
  return data
}

/**
 * Dispara a rodada. Mesmo input do script original: `directUrls` com os perfis,
 * `resultsType: 'posts'` e `resultsLimit` POR PERFIL.
 */
export async function startRun(args: {
  handles: string[]
  resultsLimit: number
  deadlineAt: number
}): Promise<ApifyRun> {
  const directUrls = args.handles.map((handle) => `https://www.instagram.com/${handle}/`)

  const { data } = await apifyJson(
    `/acts/${APIFY_ACTOR}/runs?timeout=${RUN_TIMEOUT_SECS}`,
    {
      method: 'POST',
      deadlineAt: args.deadlineAt,
      body: {
        directUrls,
        resultsType: 'posts',
        resultsLimit: args.resultsLimit,
        addParentData: false,
      },
    },
    z.object({ data: runSchema }),
  )

  return data
}

/**
 * Espera a rodada terminar, até o `deadlineAt`.
 *
 * Devolve `null` quando o orçamento acabou antes — e aí a rodada continua viva
 * na Apify, para a próxima invocação coletar. NÃO aborta: abortar joga fora
 * resultado já pago e obriga a raspar o mesmo perfil de novo.
 */
export async function waitForRun(args: {
  runId: string
  deadlineAt: number
}): Promise<ApifyRun | null> {
  for (;;) {
    const run = await getRun(args.runId, args.deadlineAt)
    if (!isRunActive(run)) return run

    if (Date.now() + POLL_INTERVAL_MS >= args.deadlineAt) return null
    await sleep(POLL_INTERVAL_MS)
  }
}

/**
 * Puxa o dataset. Vale para rodada `SUCCEEDED` e também para `FAILED` /
 * `ABORTED` / `TIMED-OUT`: o que já entrou no dataset até a falha foi cobrado,
 * então jogar fora seria pagar duas vezes pelo mesmo perfil.
 */
export async function fetchDatasetItems(
  datasetId: string,
  deadlineAt: number,
): Promise<unknown[]> {
  return apifyJson(
    `/datasets/${datasetId}/items?format=json&clean=true`,
    { deadlineAt },
    z.array(z.unknown()),
  )
}

/**
 * Descarta item cujo `ownerUsername` não está na lista pedida.
 *
 * Está aqui, e não na ingestão, porque é característica do ator: pedindo o
 * perfil A, a Apify às vezes devolve publicação de uma conta MARCADA nela
 * (colaboração, repost). No script original esse item entrava sem categoria e
 * virava ruído na biblioteca. Aqui é pior: `library_items.profile_id` ficaria
 * nulo ou, na hipótese de a conta marcada também ser acompanhada, os posts
 * dela entrariam pela porta errada e envenenariam a MEDIANA do perfil — que é
 * a régua do outlier. Régua contaminada esconde outlier de verdade em silêncio.
 */
export function keepRequestedHandles(items: unknown[], handles: string[]): unknown[] {
  const allowed = new Set(
    handles.map((handle) => handle.trim().toLowerCase().replace(/^@/, '')),
  )

  return items.filter((item) => {
    const owner = (item as { ownerUsername?: unknown }).ownerUsername
    return typeof owner === 'string' && allowed.has(owner.trim().toLowerCase())
  })
}
