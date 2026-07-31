import { describe, expect, it } from 'vitest'

import { volumeSignal } from '@/lib/risk/volume'

/**
 * Cap fixo em 60 (o padrão de SEND_HOURLY_CAP) para os limites caírem em
 * números redondos: 60% = 36 envios, 90% = 54 envios.
 */
describe('volumeSignal', () => {
  const CAP = 60

  it('verde bem abaixo do teto', () => {
    const signal = volumeSignal(10, CAP)
    expect(signal.level).toBe('verde')
  })

  it('verde logo antes do corte amarelo (35 de 60 = 58%)', () => {
    expect(volumeSignal(35, CAP).level).toBe('verde')
  })

  it('o corte amarelo é inclusivo (36 de 60 = 60%)', () => {
    expect(volumeSignal(36, CAP).level).toBe('amarelo')
  })

  it('amarelo logo antes do corte vermelho (53 de 60 ≈ 88%)', () => {
    expect(volumeSignal(53, CAP).level).toBe('amarelo')
  })

  it('o corte vermelho é inclusivo (54 de 60 = 90%)', () => {
    expect(volumeSignal(54, CAP).level).toBe('vermelho')
  })

  it('vermelho ao estourar o teto', () => {
    const signal = volumeSignal(70, CAP)
    expect(signal.level).toBe('vermelho')
    expect(signal.detail).toContain('70')
    expect(signal.detail).toContain('60')
  })

  it('sem envios, sem risco', () => {
    expect(volumeSignal(0, CAP).level).toBe('verde')
  })

  it('cap zero não gera divisão por zero (fica verde por segurança)', () => {
    const signal = volumeSignal(5, 0)
    expect(signal.level).toBe('verde')
    expect(Number.isFinite(signal.value)).toBe(true)
  })
})
