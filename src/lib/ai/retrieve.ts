import type { LibraryItem } from '@/types/db'

/**
 * O grounding do gerador: quais vídeos da biblioteca entram no prompt.
 *
 * É RAG textual, sem vector store — casamento de termos mais um empurrão por
 * performance. O empurrão é pelo `outlier` (quantas vezes o vídeo passou da
 * mediana do PRÓPRIO perfil), não pelas plays absolutas: plays cruas ranqueiam
 * tamanho de audiência, e tamanho de audiência não é replicável. Ver
 * `src/lib/library/outlier.ts` para a matemática.
 */

/** Palavras que aparecem em qualquer legenda e por isso não discriminam nada. */
const STOP_WORDS = new Set([
  'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'uma', 'para', 'com',
  'no', 'na', 'os', 'as', 'dos', 'das', 'por', 'como', 'sem', 'pra', 'pro',
  'pilar', 'tema',
])

/** Abaixo disso o termo é preposição disfarçada e casa com tudo. */
const MIN_TERM_LENGTH = 4

/** Peso de um termo do tema que aparece no conteúdo. */
const TERM_WEIGHT = 1.5

/**
 * Teto do empurrão por performance — os mesmos pesos do projeto de origem.
 *
 * A conta importa: um vídeo que estourou muito (empurrão cheio, 2.5) passa na
 * frente de um vídeo que casa UM termo do tema (1.5), e perde para um que casa
 * DOIS (3.0). Não é acidente — o que se modela aqui é FORMATO, e formato
 * atravessa assunto: o arco de um viral de outro tema ensina mais que um vídeo
 * morno sobre o tema exato. A partir de dois termos, tema volta a mandar.
 */
const OUTLIER_WEIGHT = 2.5

/** Onde o multiplicador satura. 10× a mediana já é "estourou"; 40× não é 4 vezes melhor. */
const OUTLIER_CEILING = 10

function terms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-zà-ú0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= MIN_TERM_LENGTH && !STOP_WORDS.has(term))
}

function haystack(item: LibraryItem): string {
  return `${item.caption} ${item.structure ?? ''} ${item.hook_text ?? ''} ${item.category ?? ''}`.toLowerCase()
}

function performanceBoost(item: LibraryItem): number {
  const outlier = item.outlier ?? 0
  if (outlier <= 0) return 0
  return (Math.min(outlier, OUTLIER_CEILING) / OUTLIER_CEILING) * OUTLIER_WEIGHT
}

/**
 * Ordena a biblioteca pela relevância ao tema e devolve os `limit` primeiros.
 *
 * Empate é resolvido pela ordem de entrada — determinístico de propósito, para
 * o mesmo pedido gerar o mesmo prompt e o teste poder afirmar alguma coisa.
 */
export function scoreLibrary(items: LibraryItem[], query: string, limit = 6): LibraryItem[] {
  const queryTerms = terms(query)

  return items
    .map((item, index) => {
      const content = haystack(item)
      const matched = queryTerms.reduce(
        (total, term) => total + (content.includes(term) ? TERM_WEIGHT : 0),
        0,
      )
      return { item, index, score: matched + performanceBoost(item) }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((scored) => scored.item)
}

/** Quanto da legenda cabe no prompt sem afogar o resto dele. */
const CAPTION_EXCERPT = 200

function outlierLabel(item: LibraryItem): string {
  return item.outlier !== null ? `, ${item.outlier}× a mediana do perfil` : ''
}

export function formatRefs(items: LibraryItem[]): string {
  return items
    .map((item) => {
      const caption = item.caption.slice(0, CAPTION_EXCERPT)
      const structure = item.structure ? ` | estrutura que funcionou: ${item.structure}` : ''
      return `• (@${item.owner_handle ?? '?'}, ${item.plays} plays${outlierLabel(item)}) "${caption}"${structure}`
    })
    .join('\n')
}

/** Quantos ganchos campeões cabem no system prompt sem virar lista decorativa. */
const HOOK_PATTERNS_LIMIT = 8

/**
 * O bloco de ganchos campeões: os primeiros segundos dos vídeos que mais
 * estouraram, literais, para o modelo modelar o TIPO de abertura que funciona
 * neste nicho em vez de inventar do zero.
 *
 * Devolve `null` quando não há gancho registrado — prompt com bloco vazio pede
 * ao modelo que imite nada, o que é pior que não pedir.
 */
export function formatHookPatterns(
  items: LibraryItem[],
  limit = HOOK_PATTERNS_LIMIT,
): string | null {
  const hooks = items
    .filter((item) => item.hook_text !== null && item.hook_text.trim() !== '')
    .sort((a, b) => (b.outlier ?? 0) - (a.outlier ?? 0))
    .slice(0, limit)
    .map((item) => `- "${item.hook_text}"${outlierLabel(item).replace(/^, /, ' — ')}`)

  if (hooks.length === 0) return null

  return `# GANCHOS QUE JÁ ESTOURARAM NESTE NICHO (modele o TIPO de abertura, nunca o texto)
${hooks.join('\n')}`
}
