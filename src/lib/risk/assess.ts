import { concentrationSignal } from '@/lib/risk/concentration'
import { nightSendSignal } from '@/lib/risk/night-sends'
import { publicReplyShareSignal, type SendCounts } from '@/lib/risk/public-reply-share'
import { similaritySignal } from '@/lib/risk/similarity'
import type { RiskLevel, RiskReport, RiskSignal } from '@/lib/risk/types'
import { volumeSignal } from '@/lib/risk/volume'

export interface RiskInput {
  /** Teto de envios/hora (`SEND_HOURLY_CAP`). */
  cap: number
  /** Quantos envios (de qualquer tipo) já saíram na última hora. */
  sendsLastHour: number
  /** Horário de cada envio na última hora — usado para achar rajada (concentração). */
  hourlySendTimestamps: Date[]
  /** Texto das últimas mensagens de saída da automação. */
  recentOutgoingTexts: string[]
  /** Contagem por tipo num período maior (ex.: 24h) — base da proporção de resposta pública. */
  recentSendCounts: SendCounts
  /** Horário de cada envio no mesmo período maior — base do sinal de madrugada. */
  recentSendTimestamps: Date[]
  account: { quiet_from: number | null; quiet_to: number | null }
}

const SEVERITY: Record<RiskLevel, number> = { vermelho: 0, amarelo: 1, verde: 2 }

/**
 * Junta os cinco sinais num veredito só. A ordem de entrada já é a ordem de
 * prioridade — similaridade primeiro, é o sinal mais importante (repetição de
 * texto foi a causa direta da restrição de 30/07/2026) — e `Array#sort` é
 * estável, então empate de nível mantém essa prioridade em vez de embaralhar.
 */
export function assessRisk(input: RiskInput): RiskReport {
  const signals: RiskSignal[] = [
    similaritySignal(input.recentOutgoingTexts),
    volumeSignal(input.sendsLastHour, input.cap),
    concentrationSignal(input.hourlySendTimestamps, input.cap),
    publicReplyShareSignal(input.recentSendCounts),
    nightSendSignal(input.recentSendTimestamps, input.account),
  ]

  const sorted = [...signals].sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level])
  const worst = sorted[0]
  const level: RiskLevel = worst?.level ?? 'verde'

  const recommendation =
    !worst || worst.level === 'verde'
      ? 'Nenhum sinal fora do esperado agora — spintax, jitter e o cap seguem dando conta.'
      : worst.detail

  return { level, signals: sorted, recommendation }
}
