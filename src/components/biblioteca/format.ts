import { MIN_AMOSTRA, OUTLIER_RELEVANTE } from '@/lib/library/outlier'

/**
 * Formatação e resumo da biblioteca — puro, sem React, para poder ser testado
 * sem montar árvore nenhuma.
 *
 * O que mora aqui é o que quebra em silêncio: número que vira `NaN`, e
 * principalmente o rótulo do outlier NULO. Multiplicador ausente e
 * multiplicador baixo dizem coisas opostas ("ainda não dá para saber" contra
 * "performou na média") e é fácil colapsar os dois num `?? 0` distraído — o
 * teste ao lado existe para impedir isso.
 */

const COMPACT = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const PERCENT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const ONE_DECIMAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Marca de ausência de dado. Traço, não "0": zero é um valor, ausência não. */
export const SEM_DADO = '—'

/** 112806 → "113 mil". Abaixo de mil sai inteiro, que é mais legível que "0,9 mil". */
export function compact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return SEM_DADO
  if (Math.abs(value) < 1000) return String(Math.round(value))
  return COMPACT.format(value)
}

/** 0.0432 → "4,3%". Null vira traço — engajamento sem play não é 0%, é desconhecido. */
export function percent(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return SEM_DADO
  return PERCENT.format(rate)
}

/** 42 → "0:42", 95 → "1:35". Null quando a raspagem não trouxe a duração. */
export function duration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** "2026-07-12T..." → "12/07/26". Null quando o post não tem data. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** "talking_head" → "talking head". A raspagem grava em snake_case; a tela lê. */
export function humanize(value: string | null | undefined): string | null {
  const clean = value?.trim().replace(/[_-]+/g, ' ')
  return clean ? clean : null
}

/**
 * Os três estados possíveis do multiplicador — e são TRÊS, não dois.
 *
 * `sem-regua` é o caso que mais engana: perfil com menos de `MIN_AMOSTRA`
 * vídeos raspados não tem mediana confiável, então não existe multiplicador.
 * Mostrar "0×" ali seria afirmar que o vídeo performou mal, quando a verdade é
 * que ninguém sabe ainda. Ver o cabeçalho de `src/lib/library/outlier.ts`.
 */
export type OutlierState = 'destaque' | 'normal' | 'sem-regua'

export interface OutlierLabel {
  state: OutlierState
  text: string
  /** Explicação de passar o mouse — a frase que ensina o que o número é. */
  title: string
}

export function outlierLabel(outlier: number | null | undefined): OutlierLabel {
  if (outlier == null || !Number.isFinite(outlier)) {
    return {
      state: 'sem-regua',
      text: 'sem régua',
      title: `Menos de ${MIN_AMOSTRA} vídeos raspados deste perfil: a mediana ainda é ruído, então não dá para dizer se este performou acima do normal. Não é performance baixa — é ausência de medida.`,
    }
  }

  const text = `${ONE_DECIMAL.format(outlier)}× a mediana`

  if (outlier >= OUTLIER_RELEVANTE) {
    return {
      state: 'destaque',
      text,
      title: `Passou de ${ONE_DECIMAL.format(OUTLIER_RELEVANTE)}× a mediana de plays do próprio perfil. Daqui para cima o resultado não é variação normal — é o que vale modelar.`,
    }
  }

  return {
    state: 'normal',
    text,
    title:
      'Dentro da variação normal do próprio perfil. Serve de referência de formato, mas não foi este vídeo que estourou.',
  }
}

export interface LibrarySummary {
  /** Quantos conteúdos no recorte. */
  total: number
  /** Soma de plays — a régua pública do reel, não `views`. */
  plays: number
  /** Quantos passaram de `OUTLIER_RELEVANTE`. O número que a tela existe para responder. */
  destaques: number
  /** Quantos ainda não têm multiplicador. Sai como ressalva, não como zero. */
  semRegua: number
  /** Média do engajamento entre os que têm play. Null quando nenhum tem. */
  engagement: number | null
}

/**
 * O resumo do recorte que está na tela — de propósito sobre os itens
 * FILTRADOS, e não sobre o acervo inteiro: com um filtro ligado a pergunta
 * deixa de ser "quanto eu tenho" e passa a ser "o que tem neste corte".
 */
export function summarize(
  items: ReadonlyArray<{
    plays: number
    outlier: number | null
    engagementRate: number | null
  }>,
): LibrarySummary {
  let plays = 0
  let destaques = 0
  let semRegua = 0
  let engagementSum = 0
  let engagementCount = 0

  for (const item of items) {
    if (Number.isFinite(item.plays)) plays += item.plays

    if (item.outlier == null || !Number.isFinite(item.outlier)) semRegua += 1
    else if (item.outlier >= OUTLIER_RELEVANTE) destaques += 1

    if (item.engagementRate != null && Number.isFinite(item.engagementRate)) {
      engagementSum += item.engagementRate
      engagementCount += 1
    }
  }

  return {
    total: items.length,
    plays,
    destaques,
    semRegua,
    engagement: engagementCount === 0 ? null : engagementSum / engagementCount,
  }
}
