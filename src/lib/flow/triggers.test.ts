import { describe, expect, it } from 'vitest'

import { matches } from '@/lib/flow/triggers'
import type { Trigger } from '@/types/db'

/**
 * O matcher decide se um comentário vira lead. Frouxo demais dispara para
 * quem não pediu (e a Meta enxerga isso como spam); rígido demais perde
 * lead por causa de um acento.
 */
function trigger(partial: Partial<Trigger>): Trigger {
  return {
    id: 't',
    account_id: 'a',
    flow_id: 'f',
    type: 'comment',
    keywords: [],
    match_mode: 'contains',
    media_id: null,
    public_reply: null,
    priority: 0,
    is_active: true,
    created_at: '2026-07-30T00:00:00Z',
    ...partial,
  }
}

describe('matches', () => {
  it('sem palavra-chave, casa com qualquer texto', () => {
    expect(matches(trigger({ keywords: [] }), 'qualquer coisa')).toBe(true)
  })

  describe('normalização', () => {
    it.each(['EU QUERO', 'eu quero', 'Eu Quero'])('ignora maiúsculas: %s', (text) => {
      expect(matches(trigger({ keywords: ['eu quero'] }), text)).toBe(true)
    })

    it.each(['eu quéro', 'EU QUÉRO', 'eu querò'])('ignora acento: %s', (text) => {
      expect(matches(trigger({ keywords: ['eu quero'] }), text)).toBe(true)
    })

    it('a palavra-chave cadastrada com acento também casa sem acento', () => {
      expect(matches(trigger({ keywords: ['inscrição'] }), 'inscricao')).toBe(true)
    })
  })

  describe('contains (padrão)', () => {
    it('acha no meio da frase', () => {
      expect(matches(trigger({ keywords: ['mapa'] }), 'quero o mapa por favor')).toBe(true)
    })

    it('não casa quando a palavra não está lá', () => {
      expect(matches(trigger({ keywords: ['mapa'] }), 'quero o guia')).toBe(false)
    })

    it('casa como substring — "mapa" está dentro de "mapamundi"', () => {
      expect(matches(trigger({ keywords: ['mapa'] }), 'mapamundi')).toBe(true)
    })
  })

  describe('exact', () => {
    it('exige o texto inteiro igual', () => {
      const t = trigger({ keywords: ['mapa'], match_mode: 'exact' })
      expect(matches(t, 'mapa')).toBe(true)
      expect(matches(t, '  mapa  ')).toBe(true)
      expect(matches(t, 'quero o mapa')).toBe(false)
    })
  })

  describe('starts_with', () => {
    it('exige começar com a palavra', () => {
      const t = trigger({ keywords: ['quero'], match_mode: 'starts_with' })
      expect(matches(t, 'quero sim!')).toBe(true)
      expect(matches(t, 'eu quero')).toBe(false)
    })
  })

  it('basta uma palavra-chave casar', () => {
    const t = trigger({ keywords: ['mapa', 'guia', 'checklist'] })
    expect(matches(t, 'me manda o checklist')).toBe(true)
    expect(matches(t, 'me manda o pdf')).toBe(false)
  })
})
