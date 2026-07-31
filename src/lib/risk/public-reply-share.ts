import { formatPercent, levelFromRatio, type RiskSignal } from '@/lib/risk/types'

/**
 * Proporção de resposta pública sobre o total de envios. Resposta pública é
 * um comentário no post — visível pra qualquer um, ao contrário da DM. Um
 * padrão repetido ali é o que mais chama atenção: foi a causa direta da
 * restrição de 30/07/2026 (o mesmo comentário publicado quatro vezes).
 */

export interface SendCounts {
  dm: number
  privateReply: number
  publicReply: number
}

const THRESHOLDS = { amarelo: 0.2, vermelho: 0.4 }

export function publicReplyShareSignal(counts: SendCounts): RiskSignal {
  const total = counts.dm + counts.privateReply + counts.publicReply
  const label = 'Resposta pública sobre o total'

  if (total === 0) {
    return { id: 'resposta_publica', label, level: 'verde', value: 0, detail: 'Sem envios no período.' }
  }

  const ratio = counts.publicReply / total
  const level = levelFromRatio(ratio, THRESHOLDS)
  const pct = formatPercent(ratio)

  const detail =
    level === 'vermelho'
      ? `${pct} dos envios recentes (${counts.publicReply} de ${total}) foram respostas públicas em comentário — prefira a DM quando a janela permitir.`
      : level === 'amarelo'
        ? `${pct} dos envios recentes (${counts.publicReply} de ${total}) foram respostas públicas — é o formato mais visível, vale acompanhar.`
        : `${pct} dos envios recentes (${counts.publicReply} de ${total}) foram respostas públicas.`

  return { id: 'resposta_publica', label, level, value: ratio, detail }
}
