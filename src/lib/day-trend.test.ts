import { describe, expect, it } from 'vitest'

import { computeDayTrend, dayWindows, startOfDayInTz } from '@/lib/day-trend'

/** Horário de Brasília é UTC-3 (sem horário de verão desde 2019). */
const at = (iso: string) => new Date(iso)

describe('startOfDayInTz', () => {
  it('acha a meia-noite local quando o instante já é depois da meia-noite BR', () => {
    // 14:23Z = 11:23 BR, ainda dia 31 em ambos.
    const start = startOfDayInTz(at('2026-07-31T14:23:00Z'))
    expect(start.toISOString()).toBe('2026-07-31T03:00:00.000Z')
  })

  it('acha a meia-noite local quando UTC já virou o dia mas BR não', () => {
    // 01:00Z do dia 31 = 22:00 BR do dia 30 — "hoje" em BR ainda é 30.
    const start = startOfDayInTz(at('2026-07-31T01:00:00Z'))
    expect(start.toISOString()).toBe('2026-07-30T03:00:00.000Z')
  })

  it('a meia-noite local vira 03:00Z (UTC-3 fixo)', () => {
    const start = startOfDayInTz(at('2026-01-15T12:00:00Z'))
    expect(start.getUTCHours()).toBe(3)
    expect(start.getUTCMinutes()).toBe(0)
  })
})

describe('dayWindows', () => {
  it('hoje/ontem/amanhã são dias civis consecutivos de 24h', () => {
    const { todayStart, tomorrowStart, yesterdayStart } = dayWindows(at('2026-07-31T14:23:00Z'))

    expect(todayStart.toISOString()).toBe('2026-07-31T03:00:00.000Z')
    expect(tomorrowStart.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(yesterdayStart.toISOString()).toBe('2026-07-30T03:00:00.000Z')
  })

  it('um instante logo antes da virada BR ainda cai no dia anterior', () => {
    // 02:59Z do dia 31 = 23:59 BR do dia 30.
    const { todayStart } = dayWindows(at('2026-07-31T02:59:00Z'))
    expect(todayStart.toISOString()).toBe('2026-07-30T03:00:00.000Z')
  })

  it('um instante logo depois da virada BR já cai no dia seguinte', () => {
    // 03:00Z do dia 31 = 00:00 BR do dia 31 em ponto.
    const { todayStart } = dayWindows(at('2026-07-31T03:00:00Z'))
    expect(todayStart.toISOString()).toBe('2026-07-31T03:00:00.000Z')
  })
})

describe('computeDayTrend', () => {
  it('sobe: delta positivo e percentual arredondado', () => {
    expect(computeDayTrend(10, 5)).toEqual({
      today: 10,
      yesterday: 5,
      delta: 5,
      deltaPercent: 100,
    })
  })

  it('desce: delta negativo', () => {
    expect(computeDayTrend(5, 10)).toEqual({
      today: 5,
      yesterday: 10,
      delta: -5,
      deltaPercent: -50,
    })
  })

  it('empata: delta zero', () => {
    expect(computeDayTrend(4, 4)).toEqual({
      today: 4,
      yesterday: 4,
      delta: 0,
      deltaPercent: 0,
    })
  })

  it('ontem zerado não divide por zero — percentual fica null', () => {
    expect(computeDayTrend(3, 0)).toEqual({
      today: 3,
      yesterday: 0,
      delta: 3,
      deltaPercent: null,
    })
  })

  it('os dois zerados: sem leads em nenhum dos dias', () => {
    expect(computeDayTrend(0, 0)).toEqual({
      today: 0,
      yesterday: 0,
      delta: 0,
      deltaPercent: null,
    })
  })

  it('arredonda percentuais fracionários', () => {
    // 7 vs 3 => +133.33...% arredonda para 133
    expect(computeDayTrend(7, 3).deltaPercent).toBe(133)
  })
})
