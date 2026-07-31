import { formatPercent, levelFromRatio, type RiskSignal } from '@/lib/risk/types'

/**
 * Volume por hora contra o teto (`SEND_HOURLY_CAP`). Chegar perto do teto já
 * é o padrão de "volume concentrado" que a Meta pune — não é preciso estourar
 * para já estar arriscado, por isso o corte amarelo fica bem antes de 100%.
 */

const THRESHOLDS = { amarelo: 0.6, vermelho: 0.9 }

export function volumeSignal(sendsLastHour: number, cap: number): RiskSignal {
  const ratio = cap > 0 ? sendsLastHour / cap : 0
  const level = levelFromRatio(ratio, THRESHOLDS)
  const pct = formatPercent(ratio)

  const detail =
    level === 'vermelho'
      ? `${sendsLastHour} de ${cap} envios permitidos na última hora (${pct} do teto) — quase estourando.`
      : level === 'amarelo'
        ? `${sendsLastHour} de ${cap} envios permitidos na última hora (${pct} do teto) — de olho, se manter o ritmo bate no cap.`
        : `${sendsLastHour} de ${cap} envios permitidos na última hora (${pct} do teto).`

  return { id: 'volume', label: 'Volume por hora', level, value: ratio, detail }
}
