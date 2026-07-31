import { describe, expect, it } from 'vitest'

import { formatPercent, levelFromRatio } from '@/lib/risk/types'

describe('levelFromRatio', () => {
  const thresholds = { amarelo: 0.35, vermelho: 0.6 }

  it('verde abaixo do corte amarelo', () => {
    expect(levelFromRatio(0.34, thresholds)).toBe('verde')
  })

  it('o corte amarelo é inclusivo', () => {
    expect(levelFromRatio(0.35, thresholds)).toBe('amarelo')
  })

  it('amarelo logo abaixo do corte vermelho', () => {
    expect(levelFromRatio(0.59, thresholds)).toBe('amarelo')
  })

  it('o corte vermelho é inclusivo', () => {
    expect(levelFromRatio(0.6, thresholds)).toBe('vermelho')
  })

  it('vermelho acima de 1 (estourou o teto, não só bateu nele)', () => {
    expect(levelFromRatio(1.5, thresholds)).toBe('vermelho')
  })
})

describe('formatPercent', () => {
  it('arredonda para o inteiro mais próximo', () => {
    expect(formatPercent(0.824)).toBe('82%')
    expect(formatPercent(0.825)).toBe('83%')
  })

  it('zero e um nas pontas', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })
})
