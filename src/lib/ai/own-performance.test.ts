import { describe, expect, it } from 'vitest'

import { buildOwnPerformanceBlock, type OwnPerformance, type OwnPost } from '@/lib/ai/own-performance'

function post(over: Partial<OwnPost> = {}): OwnPost {
  return {
    mediaId: '1',
    caption: 'legenda',
    durationSec: 40,
    hookText: null,
    visualFormat: null,
    views: 1000,
    viraramDM: 10,
    dmPorMilViews: 10,
    avgWatchMs: null,
    skipRate: null,
    postedAt: null,
    ...over,
  }
}

describe('buildOwnPerformanceBlock', () => {
  const performance: OwnPerformance = {
    melhores: [post({ mediaId: 'a', dmPorMilViews: 22.5, viraramDM: 45, hookText: 'O Claude é puxa-saco' })],
    piores: [post({ mediaId: 'b', dmPorMilViews: 0.4, viraramDM: 2, views: 5000, durationSec: 90 })],
    amostra: 8,
  }

  it('declara a régua e por que ela não é alcance', () => {
    // Ranquear por view ensinaria o gerador a fazer vídeo popular — objetivo
    // diferente do dono, que quer conversa.
    const bloco = buildOwnPerformanceBlock(performance)
    expect(bloco).toContain('VIRARAM CONVERSA por mil views')
    expect(bloco).toContain('não alcance')
  })

  it('mostra os dois extremos, para o contraste existir', () => {
    const bloco = buildOwnPerformanceBlock(performance)
    expect(bloco).toContain('Os que mais converteram')
    expect(bloco).toContain('Os que menos converteram')
    expect(bloco).toContain('22.5 DM/mil views')
    expect(bloco).toContain('0.4 DM/mil views')
  })

  it('NÃO conclui a causa — manda o modelo olhar a diferença', () => {
    // Concluir "vídeos curtos convertem mais" com meia dúzia de pontos
    // plantaria uma regra confiante e provavelmente falsa, que o gerador
    // trataria como verdade em todo roteiro seguinte.
    const bloco = buildOwnPerformanceBlock(performance)
    expect(bloco).toContain('Olhe a diferença')
    expect(bloco).toContain('ignore este bloco')
  })

  it('usa o gancho quando existe, e cai na legenda quando não', () => {
    const bloco = buildOwnPerformanceBlock(performance)
    expect(bloco).toContain('gancho: "O Claude é puxa-saco"')
    expect(bloco).toContain('legenda: "legenda"')
  })

  it('mostra o número absoluto junto da taxa', () => {
    // Taxa sozinha engana: 1 DM em 40 views é 25/mil e não significa nada.
    expect(buildOwnPerformanceBlock(performance)).toContain('(45 de 1000)')
  })

  it('inclui retenção quando medida, e omite quando não', () => {
    const comRetencao = buildOwnPerformanceBlock({
      ...performance,
      melhores: [post({ avgWatchMs: 32000, skipRate: 61.2 })],
    })
    expect(comRetencao).toContain('assistiram 32s em média')
    expect(comRetencao).toContain('61.2% pularam')
    expect(buildOwnPerformanceBlock(performance)).not.toContain('em média')
  })
})
