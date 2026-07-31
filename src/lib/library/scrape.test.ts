import { describe, expect, it, vi } from 'vitest'

/**
 * O cursor da raspagem e o preço dela.
 *
 * `pickStaleProfiles` é o que decide quem vai para a próxima rodada da Apify.
 * Errar aqui não dá erro nenhum — dá conta: perfil raspado duas vezes no mesmo
 * dia é crédito queimado de um plano grátis de US$ 5/mês.
 */

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => ({}) },
}))

const { pickStaleProfiles, SCRAPE_STALE_MS } = await import('@/lib/library/scrape')
const { DEFAULT_POSTS_PER_PROFILE, estimateScrapeCostFor } = await import('@/lib/library/cost')

const AGORA = new Date('2026-07-31T12:00:00.000Z').getTime()

const profile = (id: string, lastScrapedAt: string | null) => ({
  id,
  username: id,
  category: 'vibe-coding',
  last_scraped_at: lastScrapedAt,
})

describe('pickStaleProfiles', () => {
  it('perfil recém-importado entra na primeira rodada', () => {
    const pendentes = pickStaleProfiles({
      profiles: [profile('novo', null)],
      now: AGORA,
      staleMs: SCRAPE_STALE_MS,
    })

    expect(pendentes.map((p) => p.id)).toEqual(['novo'])
  })

  it('perfil raspado agora há pouco não volta — é a trava do clique repetido', () => {
    const pendentes = pickStaleProfiles({
      profiles: [
        profile('acabou-de-sair', new Date(AGORA - 60_000).toISOString()),
        profile('ontem', new Date(AGORA - 20 * 60 * 60 * 1000).toISOString()),
      ],
      now: AGORA,
      staleMs: SCRAPE_STALE_MS,
    })

    expect(pendentes.map((p) => p.id)).toEqual(['ontem'])
  })

  it('carimbo corrompido conta como nunca raspado', () => {
    const pendentes = pickStaleProfiles({
      profiles: [profile('quebrado', 'nao-e-data')],
      now: AGORA,
      staleMs: SCRAPE_STALE_MS,
    })

    expect(pendentes).toHaveLength(1)
  })
})

describe('estimateScrapeCostFor', () => {
  it('avisa o preço antes do clique', () => {
    // Os 31 perfis da lista inicial, no padrão de 12 posts.
    const estimativa = estimateScrapeCostFor({
      activeProfiles: 31,
      postsPerProfile: DEFAULT_POSTS_PER_PROFILE,
    })

    expect(estimativa.results).toBe(372)
    expect(estimativa.usd).toBe(1)
    // Um quinto do crédito mensal. Com os 30 posts do script original seria
    // US$ 2,51 — metade do mês num clique.
    expect(estimativa.shareOfCredit).toBe(0.2)
  })

  it('sem perfil, sem custo', () => {
    expect(estimateScrapeCostFor({ activeProfiles: 0, postsPerProfile: 30 }).usd).toBe(0)
  })
})
