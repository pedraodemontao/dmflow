import { isQuiet } from '@/lib/flow/quiet-hours'
import { formatPercent, levelFromRatio, type RiskSignal } from '@/lib/risk/types'

/**
 * Envios de madrugada. Reaproveita `isQuiet` — mesmo cálculo de fuso do
 * horário de silêncio — para não duplicar a conta de fuso horário. Quando a
 * conta não configurou `quiet_from`/`quiet_to`, cai numa madrugada padrão
 * (0h–6h, horário de Brasília): não ter o horário de silêncio ligado não
 * significa que mandar DM de madrugada pare de ser um sinal.
 */

const DEFAULT_NIGHT_FROM = 0
const DEFAULT_NIGHT_TO = 6
const THRESHOLDS = { amarelo: 0.15, vermelho: 0.35 }
/** Abaixo disso não dá pra dizer nada — poucos envios não formam um padrão. */
const MIN_SAMPLES = 5
/**
 * Abaixo disso, mesmo 100% de madrugada não vira vermelho — o percentual
 * sozinho engana com amostra pequena (5 de 5 é 100% e não significa nada).
 * O sinal fica no máximo amarelo até o volume confirmar que é um padrão.
 */
const MIN_SAMPLES_FOR_RED = 15

export function nightSendSignal(
  sendTimestamps: Date[],
  account: { quiet_from: number | null; quiet_to: number | null },
): RiskSignal {
  const label = 'Envios de madrugada'
  const total = sendTimestamps.length

  if (total < MIN_SAMPLES) {
    return {
      id: 'madrugada',
      label,
      level: 'verde',
      value: 0,
      detail: `Só ${total} envio(s) recente(s) — poucos para avaliar horário.`,
    }
  }

  const window = {
    quiet_from: account.quiet_from ?? DEFAULT_NIGHT_FROM,
    quiet_to: account.quiet_to ?? DEFAULT_NIGHT_TO,
  }

  const nightCount = sendTimestamps.filter((at) => isQuiet(window, at)).length
  const ratio = nightCount / total
  const rawLevel = levelFromRatio(ratio, THRESHOLDS)
  const cappedByVolume = rawLevel === 'vermelho' && total < MIN_SAMPLES_FOR_RED
  const level = cappedByVolume ? 'amarelo' : rawLevel
  const pct = formatPercent(ratio)
  const rangeLabel = `${String(window.quiet_from).padStart(2, '0')}h–${String(window.quiet_to).padStart(2, '0')}h`

  const detail =
    level === 'vermelho'
      ? `${nightCount} de ${total} envios recentes (${pct}) caíram na madrugada (${rangeLabel}) — repetir isso todo dia é padrão de robô, não de gente acordada.`
      : level === 'amarelo'
        ? cappedByVolume
          ? `${nightCount} de ${total} envios recentes (${pct}) caíram na madrugada (${rangeLabel}) — proporção alta, mas ainda é pouco volume (< ${MIN_SAMPLES_FOR_RED}) para confirmar um padrão.`
          : `${nightCount} de ${total} envios recentes (${pct}) caíram na madrugada (${rangeLabel}).`
        : `${nightCount} de ${total} envios recentes caíram na madrugada (${rangeLabel}).`

  return { id: 'madrugada', label, level, value: ratio, detail }
}
