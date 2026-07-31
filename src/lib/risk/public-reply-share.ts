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
/**
 * Abaixo disso, mesmo 100% de resposta pública não vira vermelho — denominador
 * pequeno demais pra confirmar padrão (2 de 4 é 50% e não quer dizer nada).
 * O sinal fica no máximo amarelo até o volume confirmar.
 */
const MIN_TOTAL_FOR_RED = 15

export function publicReplyShareSignal(counts: SendCounts): RiskSignal {
  const total = counts.dm + counts.privateReply + counts.publicReply
  const label = 'Resposta pública sobre o total'

  if (total === 0) {
    return { id: 'resposta_publica', label, level: 'verde', value: 0, detail: 'Sem envios no período.' }
  }

  const ratio = counts.publicReply / total
  const rawLevel = levelFromRatio(ratio, THRESHOLDS)
  const cappedByVolume = rawLevel === 'vermelho' && total < MIN_TOTAL_FOR_RED
  const level = cappedByVolume ? 'amarelo' : rawLevel
  const pct = formatPercent(ratio)

  const detail =
    level === 'vermelho'
      ? `${pct} dos envios recentes (${counts.publicReply} de ${total}) foram respostas públicas em comentário — prefira a DM quando a janela permitir.`
      : level === 'amarelo'
        ? cappedByVolume
          ? `${pct} dos envios recentes (${counts.publicReply} de ${total}) foram respostas públicas — proporção alta, mas ainda é pouco volume (< ${MIN_TOTAL_FOR_RED}) para confirmar um padrão.`
          : `${pct} dos envios recentes (${counts.publicReply} de ${total}) foram respostas públicas — é o formato mais visível, vale acompanhar.`
        : `${pct} dos envios recentes (${counts.publicReply} de ${total}) foram respostas públicas.`

  return { id: 'resposta_publica', label, level, value: ratio, detail }
}
