import { describe, expect, it } from 'vitest'

import { isQuiet, nextOpening } from '@/lib/flow/quiet-hours'

/**
 * Horário de Brasília é UTC-3. As datas abaixo são UTC, então 01:00Z = 22h BR.
 * A faixa que cruza a meia-noite é onde esse tipo de código costuma errar.
 */
const at = (iso: string) => new Date(iso)
const hourBR = (date: Date) =>
  Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(date),
  ) % 24

describe('isQuiet', () => {
  const noite = { quiet_from: 22, quiet_to: 8 }
  const almoco = { quiet_from: 12, quiet_to: 14 }

  it('desligado quando as duas pontas são nulas', () => {
    expect(isQuiet({ quiet_from: null, quiet_to: null }, at('2026-07-30T04:00:00Z'))).toBe(false)
  })

  it('desligado quando só uma ponta está definida', () => {
    expect(isQuiet({ quiet_from: 22, quiet_to: null }, at('2026-07-30T04:00:00Z'))).toBe(false)
  })

  it('desligado quando início e fim são iguais', () => {
    expect(isQuiet({ quiet_from: 8, quiet_to: 8 }, at('2026-07-30T11:00:00Z'))).toBe(false)
  })

  describe('faixa que cruza a meia-noite (22h → 8h)', () => {
    it.each([
      ['2026-07-30T01:00:00Z', 22],
      ['2026-07-30T04:00:00Z', 1],
      ['2026-07-31T02:00:00Z', 23],
      ['2026-07-30T10:00:00Z', 7],
    ])('silencia %s (%ih BR)', (iso) => {
      expect(isQuiet(noite, at(iso))).toBe(true)
    })

    it.each([
      ['2026-07-30T12:00:00Z', 9],
      ['2026-07-30T20:00:00Z', 17],
      ['2026-07-31T00:59:00Z', 21],
    ])('deixa passar %s (%ih BR)', (iso) => {
      expect(isQuiet(noite, at(iso))).toBe(false)
    })
  })

  describe('faixa normal (12h → 14h)', () => {
    it('silencia dentro', () => {
      expect(isQuiet(almoco, at('2026-07-30T16:00:00Z'))).toBe(true) // 13h BR
    })

    it('deixa passar fora', () => {
      expect(isQuiet(almoco, at('2026-07-30T13:00:00Z'))).toBe(false) // 10h BR
    })

    it('o fim é exclusivo: às 14h em ponto já está aberto', () => {
      expect(isQuiet(almoco, at('2026-07-30T17:00:00Z'))).toBe(false) // 14h BR
    })
  })
})

describe('nextOpening', () => {
  const noite = { quiet_from: 22, quiet_to: 8 }

  it('devolve o horário de abertura, com minuto zerado', () => {
    const opening = nextOpening(noite, at('2026-07-30T04:00:00Z')) // 1h BR
    expect(hourBR(opening)).toBe(8)
    expect(opening.getMinutes()).toBe(0)
    expect(opening.getSeconds()).toBe(0)
  })

  it('a abertura calculada não está mais em silêncio', () => {
    for (const iso of ['2026-07-30T01:00:00Z', '2026-07-30T04:00:00Z', '2026-07-31T02:00:00Z']) {
      expect(isQuiet(noite, nextOpening(noite, at(iso)))).toBe(false)
    }
  })

  it('a abertura é sempre no futuro', () => {
    const from = at('2026-07-30T04:00:00Z')
    expect(nextOpening(noite, from).getTime()).toBeGreaterThan(from.getTime())
  })
})
