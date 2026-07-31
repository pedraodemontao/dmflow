import { describe, expect, it } from 'vitest'

import { concentrationSignal, maxSendsInWindow } from '@/lib/risk/concentration'

const minutesAgo = (base: Date, minutes: number) => new Date(base.getTime() - minutes * 60 * 1000)

describe('maxSendsInWindow', () => {
  it('sem envios, sem rajada', () => {
    expect(maxSendsInWindow([], 5 * 60 * 1000)).toBe(0)
  })

  it('um único envio conta 1', () => {
    expect(maxSendsInWindow([new Date()], 5 * 60 * 1000)).toBe(1)
  })

  it('envios espalhados fora da janela não se somam', () => {
    const now = new Date()
    const timestamps = [minutesAgo(now, 0), minutesAgo(now, 20), minutesAgo(now, 40)]
    expect(maxSendsInWindow(timestamps, 5 * 60 * 1000)).toBe(1)
  })

  it('acha a janela mais cheia, não só o começo ou o fim da lista', () => {
    const now = new Date()
    const timestamps = [
      minutesAgo(now, 59), // isolado
      minutesAgo(now, 30),
      minutesAgo(now, 29), // rajada de 3 aqui no meio
      minutesAgo(now, 28),
      minutesAgo(now, 1), // isolado
    ]
    expect(maxSendsInWindow(timestamps, 5 * 60 * 1000)).toBe(3)
  })

  it('não depende da ordem de entrada dos horários', () => {
    const now = new Date()
    const timestamps = [minutesAgo(now, 1), minutesAgo(now, 3), minutesAgo(now, 2)]
    expect(maxSendsInWindow(timestamps, 5 * 60 * 1000)).toBe(3)
  })
})

/**
 * Cap fixo em 60 → esperado de 5 envios numa janela de 5 minutos (distribuição
 * uniforme). Os limites (2x e 4x) caem em números redondos: 10 e 20 envios.
 */
describe('concentrationSignal', () => {
  const CAP = 60
  const now = new Date()

  function burst(count: number) {
    return Array.from({ length: count }, (_, i) => minutesAgo(now, i * (4 / count)))
  }

  it('verde: 9 envios na janela mais cheia (< 2x o esperado)', () => {
    expect(concentrationSignal(burst(9), CAP).level).toBe('verde')
  })

  it('o corte amarelo é inclusivo: 10 envios (= 2x o esperado)', () => {
    expect(concentrationSignal(burst(10), CAP).level).toBe('amarelo')
  })

  it('amarelo logo antes do corte vermelho: 19 envios (< 4x)', () => {
    expect(concentrationSignal(burst(19), CAP).level).toBe('amarelo')
  })

  it('o corte vermelho é inclusivo: 20 envios (= 4x o esperado)', () => {
    const signal = concentrationSignal(burst(20), CAP)
    expect(signal.level).toBe('vermelho')
    expect(signal.detail).toMatch(/rajada/)
  })

  it('sem envios, sem risco', () => {
    expect(concentrationSignal([], CAP).level).toBe('verde')
  })
})
