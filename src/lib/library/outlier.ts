/**
 * A matemática da biblioteca de referência — pura, sem I/O.
 *
 * A pergunta que a tela responde não é "qual vídeo teve mais views", é "qual
 * vídeo performou ACIMA DO NORMAL do próprio perfil". A diferença decide o que
 * vale modelar: 100 mil views num perfil de 1 milhão de seguidores é rotina;
 * num perfil de 5 mil é um evento. Ordenar por views absolutas ranqueia
 * tamanho de audiência, não qualidade de conteúdo — e tamanho de audiência não
 * é replicável.
 *
 * A régua é a MEDIANA do próprio perfil, não a média: um único vídeo viral
 * puxa a média para cima e passa a esconder todos os outros outliers daquele
 * perfil. A mediana ignora o extremo, que é exatamente o que se quer numa
 * medida de "o normal daqui".
 */

/** Mediana de uma lista. Devolve null quando não há amostra. */
export function median(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
  if (clean.length === 0) return null

  const meio = Math.floor(clean.length / 2)
  return clean.length % 2 === 0 ? (clean[meio - 1] + clean[meio]) / 2 : clean[meio]
}

/**
 * Amostra mínima para a mediana significar alguma coisa.
 *
 * Com dois ou três vídeos, a "mediana do perfil" é ruído: o primeiro post
 * fraco viraria régua e o segundo apareceria como outlier de 3×. Abaixo disto
 * a tela mostra o vídeo sem multiplicador, em vez de mostrar um número que
 * parece preciso e não é.
 */
export const MIN_AMOSTRA = 6

/**
 * Quantas vezes o vídeo passou do normal daquele perfil.
 *
 * `null` quando não dá para afirmar: amostra pequena demais, mediana zero
 * (perfil sem view registrada) ou o próprio vídeo sem view. Devolver 1 nesses
 * casos seria inventar "performou na média", que é uma afirmação, não uma
 * ausência de dado.
 */
export function outlierScore(args: {
  views: number | null | undefined
  medianViews: number | null | undefined
  sampleSize: number
}): number | null {
  const { views, medianViews, sampleSize } = args

  if (sampleSize < MIN_AMOSTRA) return null
  if (!views || views <= 0) return null
  if (!medianViews || medianViews <= 0) return null

  return Number((views / medianViews).toFixed(2))
}

/**
 * Engajamento: (curtidas + comentários) / views.
 *
 * Sobre VIEWS e não sobre seguidores, de propósito. Engajamento por seguidor
 * mede o quanto a base é fiel; por view mede o quanto o conteúdo prende quem
 * chegou — inclusive quem veio de fora. Num feed onde o alcance passou a vir
 * mais de recomendação que de quem segue, a segunda é a que orienta o que
 * escrever.
 */
export function engagementRate(args: {
  likes: number | null | undefined
  comments: number | null | undefined
  views: number | null | undefined
}): number | null {
  const { likes, comments, views } = args
  if (!views || views <= 0) return null

  const interacoes = (likes ?? 0) + (comments ?? 0)
  return Number((interacoes / views).toFixed(4))
}

/** A partir daqui o vídeo vale ser modelado. Abaixo é variação normal. */
export const OUTLIER_RELEVANTE = 1.5

export function isRelevante(outlier: number | null): boolean {
  return outlier !== null && outlier >= OUTLIER_RELEVANTE
}
