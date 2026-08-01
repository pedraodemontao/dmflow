import { describe, expect, it } from 'vitest'

import { generateDeliverySlug } from '@/lib/ai/slug'

/**
 * O slug é a única defesa contra enumerar tudo que já foi entregue — a
 * página é pública. Os casos abaixo cobrem as duas formas de furar essa
 * defesa: título que produz um slug capenga (vazio, só símbolo, cheio de
 * hífen solto) e duas entregas com o MESMO título colidindo no `unique` do
 * banco.
 */

describe('generateDeliverySlug', () => {
  it('gera kebab-do-título + sufixo de 6 caracteres', () => {
    const slug = generateDeliverySlug('Mapa do Conteúdo')

    expect(slug).toMatch(/^mapa-do-conteudo-[a-z0-9]{6}$/)
  })

  it('remove acento, caixa alta e pontuação', () => {
    const slug = generateDeliverySlug('7 Passos: o MÉTODO que ninguém conta!!')

    expect(slug).toMatch(/^7-passos-o-metodo-que-ninguem-conta-[a-z0-9]{6}$/)
  })

  it('cai no fallback quando o título não sobra nada em ASCII', () => {
    const slug = generateDeliverySlug('🔥🔥🔥')

    expect(slug).toMatch(/^entrega-[a-z0-9]{6}$/)
  })

  it('cai no fallback para título vazio', () => {
    expect(generateDeliverySlug('')).toMatch(/^entrega-[a-z0-9]{6}$/)
  })

  it('não deixa hífen sobrando na borda depois do corte de tamanho', () => {
    // 59 letras + um espaço vira hífen bem na posição 60 — o corte de
    // TITLE_SLUG_MAX_LENGTH (60) cai exatamente em cima dele.
    const titulo = `${'a'.repeat(59)} ${'b'.repeat(10)}`

    const slug = generateDeliverySlug(titulo)
    const [base] = slug.split(/-[a-z0-9]{6}$/)

    expect(base.endsWith('-')).toBe(false)
  })

  it('não colide: duas entregas com o MESMO título saem com slugs diferentes', () => {
    const primeiro = generateDeliverySlug('Mapa do Conteúdo')
    const segundo = generateDeliverySlug('Mapa do Conteúdo')

    expect(primeiro).not.toBe(segundo)
  })
})
