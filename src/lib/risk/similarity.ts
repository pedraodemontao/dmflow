import { formatPercent, levelFromRatio, type RiskSignal } from '@/lib/risk/types'

/**
 * Similaridade entre mensagens: o sinal mais importante do monitor. Texto
 * repetido em volume é exatamente o padrão que o filtro de spam do Instagram
 * pune — foi a causa direta da restrição de 30/07/2026. Trigrama de caractere
 * (janela de 3) é simples, sem dependência nova, e é robusto a pequenas
 * variações de espaço/pontuação — spintax bem variado derruba o número sozinho.
 */

const TRIGRAM_SIZE = 3

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}

function trigramsOf(text: string): Set<string> {
  const normalized = normalize(text)
  if (normalized.length === 0) return new Set()
  // Texto curto demais para 3 letras: trata o texto inteiro como um "trigrama"
  // só dele, senão duas mensagens de 1-2 letras nunca teriam similaridade.
  if (normalized.length < TRIGRAM_SIZE) return new Set([normalized])

  const grams = new Set<string>()
  for (let i = 0; i <= normalized.length - TRIGRAM_SIZE; i += 1) {
    grams.add(normalized.slice(i, i + TRIGRAM_SIZE))
  }
  return grams
}

/** Coeficiente de Dice sobre os trigramas: 0 = nada em comum, 1 = idênticos. */
export function textSimilarity(a: string, b: string): number {
  const setA = trigramsOf(a)
  const setB = trigramsOf(b)

  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0

  let shared = 0
  for (const gram of setA) if (setB.has(gram)) shared += 1

  return (2 * shared) / (setA.size + setB.size)
}

/**
 * Média de todas as combinações par a par — não só pares consecutivos, porque
 * spintax intercala variações e a repetição pode aparecer entre mensagens
 * não vizinhas mesmo assim.
 */
export function averagePairwiseSimilarity(texts: string[]): number {
  const clean = texts.map((t) => t.trim()).filter((t) => t.length > 0)
  if (clean.length < 2) return 0

  let sum = 0
  let pairs = 0
  for (let i = 0; i < clean.length; i += 1) {
    for (let j = i + 1; j < clean.length; j += 1) {
      sum += textSimilarity(clean[i], clean[j])
      pairs += 1
    }
  }

  return sum / pairs
}

const THRESHOLDS = { amarelo: 0.35, vermelho: 0.6 }
/** Abaixo disso não dá pra dizer nada — poucas mensagens não formam um padrão. */
const MIN_SAMPLES = 5

export function similaritySignal(recentOutgoingTexts: string[]): RiskSignal {
  const sample = recentOutgoingTexts.filter((t) => t.trim().length > 0)

  if (sample.length < MIN_SAMPLES) {
    return {
      id: 'similaridade',
      label: 'Similaridade entre respostas',
      level: 'verde',
      value: 0,
      detail: `Só ${sample.length} envio(s) recente(s) — poucos para avaliar repetição.`,
    }
  }

  const value = averagePairwiseSimilarity(sample)
  const level = levelFromRatio(value, THRESHOLDS)
  const pct = formatPercent(value)

  const detail =
    level === 'vermelho'
      ? `Suas últimas ${sample.length} respostas têm ${pct} de similaridade entre si: varie mais os textos com spintax, ex.: "{opção 1|opção 2}".`
      : level === 'amarelo'
        ? `Suas últimas ${sample.length} respostas têm ${pct} de similaridade entre si — dá para variar mais antes que vire padrão.`
        : `Suas últimas ${sample.length} respostas têm ${pct} de similaridade entre si — bem variado.`

  return { id: 'similaridade', label: 'Similaridade entre respostas', level, value, detail }
}
