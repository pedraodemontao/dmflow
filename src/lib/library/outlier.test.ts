import { describe, expect, it } from 'vitest'

import {
  MIN_AMOSTRA,
  engagementRate,
  isRelevante,
  median,
  outlierScore,
} from '@/lib/library/outlier'

describe('median', () => {
  it('devolve o do meio em lista ímpar', () => {
    expect(median([10, 100, 30])).toBe(30)
  })

  it('devolve a média dos dois do meio em lista par', () => {
    expect(median([10, 20, 30, 40])).toBe(25)
  })

  it('ignora o extremo, diferente da média', () => {
    // É por isso que a régua é mediana e não média: um viral solitário puxaria
    // a média para 202 mil e esconderia todo outlier seguinte daquele perfil.
    const views = [1000, 1100, 1200, 1300, 1_000_000]
    expect(median(views)).toBe(1200)
  })

  it('devolve nulo sem amostra', () => {
    expect(median([])).toBeNull()
  })

  it('descarta valor inválido', () => {
    expect(median([10, Number.NaN, 30, -5])).toBe(20)
  })
})

describe('outlierScore', () => {
  const base = { plays: 6000, medianPlays: 1000, sampleSize: 10 }

  it('conta quantas vezes o vídeo passou do normal do perfil', () => {
    expect(outlierScore(base)).toBe(6)
  })

  it('recusa calcular com amostra pequena', () => {
    // Com 3 vídeos a "mediana do perfil" é ruído: o primeiro post fraco
    // viraria régua e o segundo apareceria como outlier de 3×.
    expect(outlierScore({ ...base, sampleSize: MIN_AMOSTRA - 1 })).toBeNull()
  })

  it('recusa calcular sem mediana ou sem play', () => {
    // Devolver 1 aqui seria afirmar "performou na média", que é uma afirmação,
    // não uma ausência de dado.
    expect(outlierScore({ ...base, medianPlays: 0 })).toBeNull()
    expect(outlierScore({ ...base, plays: null })).toBeNull()
    expect(outlierScore({ ...base, medianPlays: null })).toBeNull()
  })

  it('arredonda para duas casas', () => {
    expect(outlierScore({ plays: 1000, medianPlays: 300, sampleSize: 10 })).toBe(3.33)
  })
})

describe('engagementRate', () => {
  it('divide interação por play, não por seguidor', () => {
    expect(engagementRate({ likes: 400, comments: 100, plays: 10_000 })).toBe(0.05)
  })

  it('trata curtida e comentário ausentes como zero', () => {
    expect(engagementRate({ likes: null, comments: null, plays: 100 })).toBe(0)
  })

  it('devolve nulo sem play', () => {
    expect(engagementRate({ likes: 10, comments: 2, plays: 0 })).toBeNull()
  })
})

describe('isRelevante', () => {
  it('separa o que vale modelar da variação normal', () => {
    expect(isRelevante(1.5)).toBe(true)
    expect(isRelevante(1.49)).toBe(false)
    expect(isRelevante(null)).toBe(false)
  })
})
