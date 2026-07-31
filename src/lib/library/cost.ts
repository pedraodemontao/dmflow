/**
 * O preço da raspagem — puro, sem I/O, para a tela poder avisar ANTES.
 *
 * O dono está no plano grátis da Apify: US$ 5 de crédito por mês. Ferramenta
 * que gasta o dinheiro dele sem avisar é ferramenta que ele desliga, então o
 * botão de raspar mostra o custo estimado antes de existir clique.
 *
 * Módulo separado de propósito: `data.ts` só quer o número, e importar
 * `apify.ts` para isso arrastaria o cliente HTTP para dentro de um Server
 * Component que nunca vai chamar a Apify.
 */

/**
 * Medido de verdade em 30/07/2026: 5 resultados custaram US$ 0,0135 na
 * `apify~instagram-scraper`. Número aferido, não tabelado — se a Apify mudar o
 * preço, é esta constante que muda.
 */
export const APIFY_COST_PER_RESULT_USD = 0.0027

/** Crédito mensal do plano grátis. Serve de denominador no aviso da tela. */
export const APIFY_FREE_CREDIT_USD = 5

/**
 * Posts por perfil na raspagem.
 *
 * O script original usava 30. Aqui o padrão é 12, e a diferença é dinheiro:
 * 31 perfis × 30 = 930 resultados = US$ 2,51, metade do crédito do mês num
 * clique só. Com 12 dá US$ 1,00. Doze também é o bastante para a mediana
 * significar alguma coisa (`MIN_AMOSTRA` é 6 em `outlier.ts`), e a amostra
 * ACUMULA: os itens ficam gravados, então cada raspagem seguinte engorda o
 * histórico do perfil em vez de substituí-lo.
 */
export const DEFAULT_POSTS_PER_PROFILE = 12

export interface ScrapeCostEstimate {
  activeProfiles: number
  postsPerProfile: number
  /** Resultados no pior caso: nem todo perfil devolve o limite cheio. */
  results: number
  usd: number
  /** Quanto isso representa do crédito mensal, de 0 a 1 (pode passar de 1). */
  shareOfCredit: number
}

export function estimateScrapeCostFor(args: {
  activeProfiles: number
  postsPerProfile: number
}): ScrapeCostEstimate {
  const activeProfiles = Math.max(0, Math.trunc(args.activeProfiles))
  const postsPerProfile = Math.max(0, Math.trunc(args.postsPerProfile))
  const results = activeProfiles * postsPerProfile
  const usd = Number((results * APIFY_COST_PER_RESULT_USD).toFixed(2))

  return {
    activeProfiles,
    postsPerProfile,
    results,
    usd,
    shareOfCredit: Number((usd / APIFY_FREE_CREDIT_USD).toFixed(3)),
  }
}

/** Custo do que de fato voltou da Apify — o que a tela mostra DEPOIS da rodada. */
export function costOfResults(results: number): number {
  return Number((Math.max(0, results) * APIFY_COST_PER_RESULT_USD).toFixed(2))
}
