/**
 * Agrupamento de linhas em baldes de tempo — puro, sem I/O.
 *
 * Puro pelo mesmo motivo de `src/lib/day-trend.ts` e `src/lib/risk/assess.ts`:
 * quem lê o banco vive em `src/lib/data.ts`, que carrega `server-only` e não
 * pode ser importado num teste. Aqui entra uma lista de instantes e sai a
 * série pronta para o gráfico.
 *
 * O balde vazio EXISTE na saída. Se um dia sem lead sumisse, a série mentiria:
 * dez dias com um lead cada viraria uma barra colada na outra, indistinguível
 * de dez leads seguidos no mesmo dia. Buraco é informação.
 */

const TZ = 'America/Sao_Paulo'

export interface SeriesBucket {
  label: string
  value: number
}

/** Formata em America/Sao_Paulo — o painel é de um usuário só, e ele mora aqui. */
function partsInTz(at: Date) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(at)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') }
}

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * Um balde por dia, do mais antigo para o mais recente, terminando em hoje.
 * `days` conta o dia corrente — `dailyBuckets(ts, 30)` são 29 dias fechados
 * mais o de hoje, ainda em andamento.
 */
export function dailyBuckets(
  timestamps: string[],
  days: number,
  now: Date = new Date(),
): SeriesBucket[] {
  const counts = new Map<string, number>()
  for (const raw of timestamps) {
    const { year, month, day } = partsInTz(new Date(raw))
    const key = `${year}-${month}-${day}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from({ length: days }, (_, index) => {
    const at = new Date(now.getTime() - (days - 1 - index) * DAY_MS)
    const { year, month, day } = partsInTz(at)
    return { label: `${day}/${month}`, value: counts.get(`${year}-${month}-${day}`) ?? 0 }
  })
}

/**
 * Uma série diária POR CHAVE, todas sobre exatamente os mesmos dias — é o que
 * permite jogar as curvas no mesmo par de eixos sem que uma comece antes da
 * outra.
 *
 * Chave sem nenhum registro na janela devolve série toda zerada, e não some da
 * saída: "esse post parou de trazer" é justamente o dado que o ranking por
 * total esconde. Some do gráfico seria o pior dos dois mundos — a linha
 * desapareceria e a legenda ficaria mentindo.
 */
export function dailyBucketsByKey(
  rows: Array<{ key: string; at: string }>,
  keys: string[],
  days: number,
  now: Date = new Date(),
): SeriesBucket[][] {
  const byKey = new Map<string, string[]>()
  for (const row of rows) {
    const list = byKey.get(row.key)
    if (list) list.push(row.at)
    else byKey.set(row.key, [row.at])
  }

  return keys.map((key) => dailyBuckets(byKey.get(key) ?? [], days, now))
}

/**
 * Um balde por hora, terminando na hora corrente. Usado no gráfico de envios:
 * é o formato da curva que denuncia disparo concentrado, e concentração é o
 * que o filtro de spam do Instagram pega (ver a blindagem no CLAUDE.md).
 */
export function hourlyBuckets(
  timestamps: string[],
  hours: number,
  now: Date = new Date(),
): SeriesBucket[] {
  const counts = new Map<string, number>()
  for (const raw of timestamps) {
    const { year, month, day, hour } = partsInTz(new Date(raw))
    counts.set(`${year}-${month}-${day}T${hour}`, (counts.get(`${year}-${month}-${day}T${hour}`) ?? 0) + 1)
  }

  return Array.from({ length: hours }, (_, index) => {
    const at = new Date(now.getTime() - (hours - 1 - index) * HOUR_MS)
    const { year, month, day, hour } = partsInTz(at)
    return { label: `${hour}h`, value: counts.get(`${year}-${month}-${day}T${hour}`) ?? 0 }
  })
}
