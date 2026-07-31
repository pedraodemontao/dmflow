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
 * Sobre PLAYS, não views: o Instagram devolve as duas contagens e elas divergem
 * muito (num vídeo real, 4.719 views contra 112.806 plays). Plays é o número
 * que aparece publicamente no reel e o que o nicho usa para comparar.
 *
 * `null` quando não dá para afirmar: amostra pequena demais, mediana zero
 * (perfil sem play registrado) ou o próprio vídeo sem play. Devolver 1 nesses
 * casos seria inventar "performou na média", que é uma afirmação, não uma
 * ausência de dado.
 */
export function outlierScore(args: {
  plays: number | null | undefined
  medianPlays: number | null | undefined
  sampleSize: number
}): number | null {
  const { plays, medianPlays, sampleSize } = args

  if (sampleSize < MIN_AMOSTRA) return null
  if (!plays || plays <= 0) return null
  if (!medianPlays || medianPlays <= 0) return null

  return Number((plays / medianPlays).toFixed(2))
}

/**
 * Engajamento: (curtidas + comentários) / plays.
 *
 * Sobre alcance e não sobre seguidores, de propósito. Engajamento por seguidor
 * mede o quanto a base é fiel; por play mede o quanto o conteúdo prende quem
 * chegou — inclusive quem veio de fora. Num feed onde o alcance vem mais de
 * recomendação que de quem segue, a segunda é a que orienta o que escrever.
 *
 * Plays e não views pelo mesmo motivo do outlier: é o número que a plataforma
 * mostra publicamente, e misturar as duas réguas no mesmo card faria dois
 * indicadores lado a lado falarem de bases diferentes.
 */
export function engagementRate(args: {
  likes: number | null | undefined
  comments: number | null | undefined
  plays: number | null | undefined
}): number | null {
  const { likes, comments, plays } = args
  if (!plays || plays <= 0) return null

  const interacoes = (likes ?? 0) + (comments ?? 0)
  return Number((interacoes / plays).toFixed(4))
}

/** A partir daqui o vídeo vale ser modelado. Abaixo é variação normal. */
export const OUTLIER_RELEVANTE = 1.5

export function isRelevante(outlier: number | null): boolean {
  return outlier !== null && outlier >= OUTLIER_RELEVANTE
}
