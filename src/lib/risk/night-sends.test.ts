import { describe, expect, it } from 'vitest'

import { nightSendSignal } from '@/lib/risk/night-sends'

/**
 * Horário de Brasília é UTC-3 (mesma convenção de quiet-hours.test.ts):
 * 06:00Z = 03h BR (madrugada padrão 0h–6h) e 15:00Z = 12h BR (fora dela).
 */
const NIGHT = new Date('2026-07-30T06:00:00Z') // 03h BR
const DAY = new Date('2026-07-30T15:00:00Z') // 12h BR
const NO_QUIET_HOURS = { quiet_from: null, quiet_to: null }

function timestamps(nightCount: number, dayCount: number): Date[] {
  return [...Array(nightCount).fill(NIGHT), ...Array(dayCount).fill(DAY)]
}

describe('nightSendSignal', () => {
  it('menos de 5 envios: verde por falta de amostra, mesmo se todos de madrugada', () => {
    const signal = nightSendSignal(timestamps(4, 0), NO_QUIET_HOURS)
    expect(signal.level).toBe('verde')
    expect(signal.detail).toContain('poucos')
  })

  it('verde logo antes do corte amarelo (2 de 20 = 10%)', () => {
    expect(nightSendSignal(timestamps(2, 18), NO_QUIET_HOURS).level).toBe('verde')
  })

  it('o corte amarelo é inclusivo (3 de 20 = 15%)', () => {
    expect(nightSendSignal(timestamps(3, 17), NO_QUIET_HOURS).level).toBe('amarelo')
  })

  it('amarelo logo antes do corte vermelho (6 de 20 = 30%)', () => {
    expect(nightSendSignal(timestamps(6, 14), NO_QUIET_HOURS).level).toBe('amarelo')
  })

  it('o corte vermelho é inclusivo (7 de 20 = 35%)', () => {
    const signal = nightSendSignal(timestamps(7, 13), NO_QUIET_HOURS)
    expect(signal.level).toBe('vermelho')
    expect(signal.detail).toContain('7')
  })

  it('nenhum envio de madrugada: verde', () => {
    expect(nightSendSignal(timestamps(0, 20), NO_QUIET_HOURS).level).toBe('verde')
  })

  it('sem quiet hours configurado, usa a madrugada padrão (0h–6h)', () => {
    const signal = nightSendSignal(timestamps(20, 0), NO_QUIET_HOURS)
    expect(signal.level).toBe('vermelho')
    expect(signal.detail).toContain('00h–06h')
  })

  it('respeita quiet_from/quiet_to da conta quando configurado, faixa cruzando meia-noite', () => {
    const account = { quiet_from: 22, quiet_to: 8 }
    // 01:00Z = 22h BR (dentro da faixa 22h–8h)
    const late = new Date('2026-07-30T01:00:00Z')
    // 13:00Z = 10h BR (fora da faixa)
    const midday = new Date('2026-07-30T13:00:00Z')

    const signal = nightSendSignal(Array(20).fill(late), account)
    expect(signal.level).toBe('vermelho')

    const calm = nightSendSignal(Array(20).fill(midday), account)
    expect(calm.level).toBe('verde')
  })

  describe('piso de volume para vermelho', () => {
    it('6 de 6 (100%) é o cenário real que motivou o ajuste: fica amarelo, não vermelho', () => {
      const signal = nightSendSignal(timestamps(6, 0), NO_QUIET_HOURS)
      expect(signal.level).toBe('amarelo')
      expect(signal.detail).toContain('pouco volume')
    })

    it('amarelo logo antes do piso de volume (14 de 14 = 100%)', () => {
      const signal = nightSendSignal(timestamps(14, 0), NO_QUIET_HOURS)
      expect(signal.level).toBe('amarelo')
    })

    it('o piso de volume é inclusivo: com 15 envios, 100% já vira vermelho', () => {
      const signal = nightSendSignal(timestamps(15, 0), NO_QUIET_HOURS)
      expect(signal.level).toBe('vermelho')
      expect(signal.detail).not.toContain('pouco volume')
    })

    it('o piso só rebaixa vermelho: um amarelo de verdade continua amarelo com amostra pequena', () => {
      // 1 de 6 ≈ 17%, já cai no corte amarelo por conta própria (>= 15%) —
      // o piso de volume não entra em jogo porque o nível bruto nem é vermelho.
      const signal = nightSendSignal(timestamps(1, 5), NO_QUIET_HOURS)
      expect(signal.level).toBe('amarelo')
    })
  })
})
