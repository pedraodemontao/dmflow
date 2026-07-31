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

  it('similaridade vermelha sozinha (alta prioridade) já pinta o geral de vermelho', () => {
    const report = assessRisk({
      ...BASE,
      recentOutgoingTexts: Array(40).fill('Oi! Aqui está o link do checklist que você pediu.'),
    })
    expect(report.level).toBe('vermelho')
    expect(report.signals[0].level).toBe('vermelho')
    expect(report.signals[0].id).toBe('similaridade')
  })

  it('volume vermelho sozinho (alta prioridade) também pinta o geral de vermelho', () => {
    const report = assessRisk({ ...BASE, sendsLastHour: 54 }) // 54 de 60 = 90%
    expect(report.level).toBe('vermelho')
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

  /**
   * Um único sinal ruidoso não pode pintar o painel inteiro de vermelho —
   * senão o dono aprende a ignorar o alerta. Vermelho geral só quando um
   * sinal de alta prioridade (similaridade/volume) está vermelho, ou quando
   * dois ou mais sinais (de qualquer tipo) estão vermelhos ao mesmo tempo.
   */
  describe('nível geral não é só o pior sinal', () => {
    function burstTimestamps(count: number, now = new Date()): Date[] {
      // Todos dentro de ~4 minutos — cabem numa única janela de 5min do sinal de concentração.
      return Array.from({ length: count }, (_, i) => new Date(now.getTime() - i * ((4 * 60 * 1000) / count)))
    }

    it('um sinal secundário vermelho sozinho (concentração) pinta o geral de amarelo, não vermelho', () => {
      const burst = burstTimestamps(20)
      const report = assessRisk({
        ...BASE,
        sendsLastHour: 20, // 20 de 60 = 33%, verde — não é o volume que está disparando aqui
        hourlySendTimestamps: burst,
      })

      const concentracao = report.signals.find((s) => s.id === 'concentracao')
      expect(concentracao?.level).toBe('vermelho') // o sinal em si continua marcado
      expect(report.level).toBe('amarelo') // mas sozinho não basta para o geral

      const outros = report.signals.filter((s) => s.id !== 'concentracao')
      expect(outros.every((s) => s.level === 'verde')).toBe(true)
    })

    it('dois sinais secundários vermelhos ao mesmo tempo já pintam o geral de vermelho', () => {
      const burst = burstTimestamps(20)
      const report = assessRisk({
        ...BASE,
        sendsLastHour: 20, // concentração vermelha, volume continua verde
        hourlySendTimestamps: burst,
        recentSendCounts: { dm: 9, privateReply: 0, publicReply: 6 }, // 6 de 15 = 40% → resposta pública vermelha
      })

      expect(report.signals.find((s) => s.id === 'concentracao')?.level).toBe('vermelho')
      expect(report.signals.find((s) => s.id === 'resposta_publica')?.level).toBe('vermelho')
      expect(report.level).toBe('vermelho')
    })
  })
})
