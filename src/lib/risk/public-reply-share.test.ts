import { describe, expect, it } from 'vitest'

import { publicReplyShareSignal, type SendCounts } from '@/lib/risk/public-reply-share'

const counts = (publicReply: number, total: number): SendCounts => ({
  dm: total - publicReply,
  privateReply: 0,
  publicReply,
})

describe('publicReplyShareSignal', () => {
  it('sem envios no período, sem risco', () => {
    const signal = publicReplyShareSignal({ dm: 0, privateReply: 0, publicReply: 0 })
    expect(signal.level).toBe('verde')
  })

  it('verde logo antes do corte amarelo (19 de 100 = 19%)', () => {
    expect(publicReplyShareSignal(counts(19, 100)).level).toBe('verde')
  })

  it('o corte amarelo é inclusivo (20 de 100 = 20%)', () => {
    expect(publicReplyShareSignal(counts(20, 100)).level).toBe('amarelo')
  })

  it('amarelo logo antes do corte vermelho (39 de 100 = 39%)', () => {
    expect(publicReplyShareSignal(counts(39, 100)).level).toBe('amarelo')
  })

  it('o corte vermelho é inclusivo (40 de 100 = 40%)', () => {
    const signal = publicReplyShareSignal(counts(40, 100))
    expect(signal.level).toBe('vermelho')
    expect(signal.detail).toContain('40')
  })

  it('só DM e private reply, nenhuma pública: verde', () => {
    const signal = publicReplyShareSignal({ dm: 50, privateReply: 10, publicReply: 0 })
    expect(signal.level).toBe('verde')
    expect(signal.value).toBe(0)
  })

  it('só resposta pública: vermelho', () => {
    const signal = publicReplyShareSignal({ dm: 0, privateReply: 0, publicReply: 5 })
    expect(signal.level).toBe('vermelho')
    expect(signal.value).toBe(1)
  })
})
