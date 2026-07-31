/**
 * Variação dia a dia (hoje vs ontem), em America/Sao_Paulo — puro, sem I/O.
 * Existe para o painel responder "quantos leads entraram hoje, contra ontem?"
 * sem cortar o dia na hora errada por causa do relógio UTC do servidor.
 *
 * Puro por design (ver `src/lib/risk/assess.ts` e `src/lib/flow/quiet-hours.ts`
 * para o mesmo padrão): quem lê o banco é `getLeadsTrend` em `src/lib/data.ts`,
 * que não pode ser importado num teste porque carrega `server-only`.
 */

const TZ = 'America/Sao_Paulo'
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Diferença (em minutos) entre o instante UTC e a hora de parede da timezone
 * naquele mesmo instante. Funciona também em fusos com horário de verão —
 * mas o Brasil não tem DST desde 2019, então para `America/Sao_Paulo` dá
 * sempre -180 aqui dentro.
 */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return (asUtc - at.getTime()) / 60_000
}

/** Meia-noite local de `at` na timezone dada, como instante UTC. */
export function startOfDayInTz(at: Date, timeZone: string = TZ): Date {
  const offset = offsetMinutes(at, timeZone)
  // Desloca `at` para a hora local "disfarçada" de UTC, trunca o dia com
  // setUTCHours (seguro, sem depender de fuso do processo Node) e desfaz o
  // deslocamento para voltar a um instante UTC real.
  const shifted = new Date(at.getTime() + offset * 60_000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - offset * 60_000)
}

export interface DayWindow {
  todayStart: Date
  tomorrowStart: Date
  yesterdayStart: Date
}

/** Janelas [ontem, hoje) e [hoje, amanhã), para contar por dia civil em vez de 24h corridas. */
export function dayWindows(now: Date = new Date()): DayWindow {
  const todayStart = startOfDayInTz(now)
  return {
    todayStart,
    tomorrowStart: new Date(todayStart.getTime() + DAY_MS),
    yesterdayStart: new Date(todayStart.getTime() - DAY_MS),
  }
}

export interface DayTrend {
  today: number
  yesterday: number
  delta: number
  /** null quando ontem foi zero — percentual sobre zero não informa nada. */
  deltaPercent: number | null
}

export function computeDayTrend(today: number, yesterday: number): DayTrend {
  const delta = today - yesterday
  return {
    today,
    yesterday,
    delta,
    deltaPercent: yesterday === 0 ? null : Math.round((delta / yesterday) * 100),
  }
}
