import { levelFromRatio, type RiskSignal } from '@/lib/risk/types'

/**
 * Concentração no tempo: mesmo dentro do teto por hora, muitos envios
 * amontoados em poucos minutos parecem disparo automático — é exatamente o
 * que o jitter existe para evitar. Mede o pior instante: a janela de
 * `WINDOW_MINUTES` com mais envios, dentro do que já foi mandado na última hora.
 */

const WINDOW_MINUTES = 5
const THRESHOLDS = { amarelo: 2, vermelho: 4 }

/**
 * Maior número de envios dentro de qualquer janela de `windowMs`, por
 * varredura de dois ponteiros sobre os horários ordenados.
 */
export function maxSendsInWindow(timestamps: Date[], windowMs: number): number {
  const sorted = timestamps.map((d) => d.getTime()).sort((a, b) => a - b)

  let start = 0
  let max = 0
  for (let end = 0; end < sorted.length; end += 1) {
    while (sorted[end] - sorted[start] > windowMs) start += 1
    max = Math.max(max, end - start + 1)
  }
  return max
}

export function concentrationSignal(sendTimestamps: Date[], cap: number): RiskSignal {
  const windowMs = WINDOW_MINUTES * 60 * 1000
  const busiest = maxSendsInWindow(sendTimestamps, windowMs)

  // Quanto caberia numa janela dessas se o cap fosse distribuído por igual na hora.
  const expected = cap * (WINDOW_MINUTES / 60)
  const ratio = expected > 0 ? busiest / expected : 0
  const level = levelFromRatio(ratio, THRESHOLDS)
  const expectedLabel = expected.toFixed(1)

  const detail =
    level === 'vermelho'
      ? `${busiest} envios caíram numa janela de ${WINDOW_MINUTES} minutos (o esperado seria uns ${expectedLabel}) — isso é rajada, não ritmo.`
      : level === 'amarelo'
        ? `${busiest} envios caíram numa janela de ${WINDOW_MINUTES} minutos (o esperado seria uns ${expectedLabel}) — um pouco concentrado.`
        : `Envios bem espaçados: no máximo ${busiest} numa janela de ${WINDOW_MINUTES} minutos.`

  return { id: 'concentracao', label: 'Concentração no tempo', level, value: ratio, detail }
}
