import { describe, expect, it } from 'vitest'

import { compact, duration, outlierLabel, percent, SEM_DADO, summarize } from './format'

describe('outlierLabel', () => {
  it('separa "sem régua" de "performou na média"', () => {
    // O bug que este teste existe para impedir: colapsar null em 0 e mostrar
    // "0,0× a mediana" num vídeo cujo perfil só tem 3 posts raspados.
    const semRegua = outlierLabel(null)
    expect(semRegua.state).toBe('sem-regua')
    expect(semRegua.text).not.toMatch(/0/)
    expect(semRegua.title).toMatch(/ausência de medida/i)

    expect(outlierLabel(0.9).state).toBe('normal')
    expect(outlierLabel(0.9).text).toBe('0,9× a mediana')
  })

  it('marca destaque só a partir do limite de relevância', () => {
    expect(outlierLabel(1.4).state).toBe('normal')
    expect(outlierLabel(1.5).state).toBe('destaque')
    expect(outlierLabel(12).state).toBe('destaque')
    expect(outlierLabel(12).text).toBe('12,0× a mediana')
  })

  it('trata número inválido como ausência, não como zero', () => {
    expect(outlierLabel(Number.NaN).state).toBe('sem-regua')
    expect(outlierLabel(undefined).state).toBe('sem-regua')
  })
})

describe('summarize', () => {
  const item = (plays: number, outlier: number | null, engagementRate: number | null) => ({
    plays,
    outlier,
    engagementRate,
  })

  it('conta destaque e "sem régua" em baldes separados', () => {
    const resumo = summarize([
      item(1000, 3.2, 0.05),
      item(500, 1.5, 0.03),
      item(200, 0.4, 0.01),
      item(100, null, null),
    ])

    expect(resumo.total).toBe(4)
    expect(resumo.plays).toBe(1800)
    expect(resumo.destaques).toBe(2)
    expect(resumo.semRegua).toBe(1)
    // Média só entre quem tem engajamento — item sem play não entra como 0.
    expect(resumo.engagement).toBeCloseTo(0.03, 5)
  })

  it('devolve engajamento nulo quando ninguém tem play', () => {
    const resumo = summarize([item(0, null, null)])
    expect(resumo.engagement).toBeNull()
    expect(resumo.destaques).toBe(0)
    expect(resumo.semRegua).toBe(1)
  })

  it('aguenta lista vazia', () => {
    expect(summarize([])).toEqual({
      total: 0,
      plays: 0,
      destaques: 0,
      semRegua: 0,
      engagement: null,
    })
  })
})

describe('formatação', () => {
  it('abrevia só a partir de mil', () => {
    expect(compact(942)).toBe('942')
    expect(compact(112806)).toMatch(/mil/)
    expect(compact(null)).toBe(SEM_DADO)
  })

  it('não confunde zero com ausência', () => {
    expect(percent(0)).not.toBe(SEM_DADO)
    expect(percent(null)).toBe(SEM_DADO)
    expect(duration(0)).toBeNull()
    expect(duration(95)).toBe('1:35')
  })
})
