import { describe, expect, it } from 'vitest'

import { dailyBuckets, hourlyBuckets } from '@/lib/series'

/** 15/07/2026 às 18h em São Paulo = 21h UTC. */
const NOW = new Date('2026-07-15T21:00:00.000Z')

describe('dailyBuckets', () => {
  it('devolve um balde por dia mesmo sem nenhum evento', () => {
    const series = dailyBuckets([], 5, NOW)

    expect(series).toHaveLength(5)
    expect(series.every((bucket) => bucket.value === 0)).toBe(true)
    // Buraco é informação: sem o dia vazio, dez dias com um lead cada viraria
    // uma barra colada na outra, indistinguível de dez leads no mesmo dia.
    expect(series.map((bucket) => bucket.label)).toEqual([
      '11/07',
      '12/07',
      '13/07',
      '14/07',
      '15/07',
    ])
  })

  it('conta no dia civil de São Paulo, não no dia UTC', () => {
    // 02h UTC do dia 15 ainda é 23h do dia 14 em São Paulo (UTC-3).
    const series = dailyBuckets(['2026-07-15T02:00:00.000Z'], 2, NOW)

    expect(series).toEqual([
      { label: '14/07', value: 1 },
      { label: '15/07', value: 0 },
    ])
  })

  it('acumula vários eventos no mesmo balde', () => {
    const series = dailyBuckets(
      ['2026-07-15T12:00:00.000Z', '2026-07-15T13:00:00.000Z', '2026-07-14T12:00:00.000Z'],
      2,
      NOW,
    )

    expect(series).toEqual([
      { label: '14/07', value: 1 },
      { label: '15/07', value: 2 },
    ])
  })

  it('ignora evento mais antigo que a janela', () => {
    const series = dailyBuckets(['2026-06-01T12:00:00.000Z'], 3, NOW)

    expect(series.every((bucket) => bucket.value === 0)).toBe(true)
  })
})

describe('hourlyBuckets', () => {
  it('termina na hora corrente e volta no tempo', () => {
    const series = hourlyBuckets([], 3, NOW)

    expect(series.map((bucket) => bucket.label)).toEqual(['16h', '17h', '18h'])
  })

  it('conta na hora de São Paulo', () => {
    // 21h UTC = 18h em São Paulo.
    const series = hourlyBuckets(['2026-07-15T21:30:00.000Z'], 2, NOW)

    expect(series).toEqual([
      { label: '17h', value: 0 },
      { label: '18h', value: 1 },
    ])
  })

  it('separa horas iguais de dias diferentes', () => {
    // Mesma hora de parede (18h), 24h antes: não pode cair no mesmo balde.
    const series = hourlyBuckets(['2026-07-14T21:30:00.000Z'], 3, NOW)

    expect(series.every((bucket) => bucket.value === 0)).toBe(true)
  })
})
