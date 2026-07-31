import { describe, expect, it } from 'vitest'

import { assessRisk, type RiskInput } from '@/lib/risk/assess'

const BASE: RiskInput = {
  cap: 60,
  sendsLastHour: 5,
  hourlySendTimestamps: [new Date()],
  recentOutgoingTexts: [
    'Oi! Quer o checklist? Manda um oi que eu te passo.',
    'Fala! Bora pro material? Chama aqui.',
    'E aí! Topa ver o passo a passo? Responde aqui.',
    'Salve! Interessado no guia? Me chama.',
    'Opa! Quer conferir o conteúdo? Só chamar.',
  ],
  recentSendCounts: { dm: 40, privateReply: 5, publicReply: 2 },
  recentSendTimestamps: Array(20).fill(new Date('2026-07-30T15:00:00Z')), // 12h BR, fora da madrugada
  account: { quiet_from: null, quiet_to: null },
}

describe('assessRisk', () => {
  it('tudo dentro do esperado dá verde, com os 5 sinais presentes', () => {
    const report = assessRisk(BASE)
    expect(report.level).toBe('verde')
    expect(report.signals).toHaveLength(5)
    expect(report.signals.map((s) => s.id).sort()).toEqual(
      ['similaridade', 'volume', 'concentracao', 'resposta_publica', 'madrugada'].sort(),
    )
    expect(report.recommendation).not.toBe('')
  })

  it('o nível geral é o pior nível entre os sinais', () => {
    const report = assessRisk({
      ...BASE,
      recentOutgoingTexts: Array(40).fill('Oi! Aqui está o link do checklist que você pediu.'),
    })
    expect(report.level).toBe('vermelho')
    expect(report.signals[0].level).toBe('vermelho')
  })

  it('a recomendação verde é uma frase neutra, não o detail de um sinal', () => {
    const report = assessRisk(BASE)
    expect(report.recommendation).toContain('Nenhum sinal fora do esperado')
  })

  it('a recomendação vermelha é o detail do sinal mais crítico', () => {
    const report = assessRisk({
      ...BASE,
      recentOutgoingTexts: Array(40).fill('Oi! Aqui está o link do checklist que você pediu.'),
    })
    expect(report.recommendation).toBe(report.signals[0].detail)
  })

  it('similaridade desempata na frente quando dois sinais empatam em vermelho', () => {
    const report = assessRisk({
      ...BASE,
      recentOutgoingTexts: Array(40).fill('Oi! Aqui está o link do checklist que você pediu.'),
      sendsLastHour: 70, // também vermelho no volume
    })
    expect(report.signals[0].id).toBe('similaridade')
    expect(report.signals[1].id).toBe('volume')
  })

  it('sinais aparecem do mais crítico para o menos crítico', () => {
    const report = assessRisk({
      ...BASE,
      sendsLastHour: 54, // vermelho
      recentSendCounts: { dm: 80, privateReply: 0, publicReply: 20 }, // amarelo (20%)
    })
    const levels = report.signals.map((s) => s.level)
    const order: Record<string, number> = { vermelho: 0, amarelo: 1, verde: 2 }
    for (let i = 1; i < levels.length; i += 1) {
      expect(order[levels[i]]).toBeGreaterThanOrEqual(order[levels[i - 1]])
    }
  })
})
