import { describe, expect, it } from 'vitest'

import { playsFromInsights } from './own-plays'

type Item = Parameters<typeof playsFromInsights>[0]['items'][number]

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1',
  profile_id: 'p1',
  platform_media_id: '111',
  plays: 0,
  views: 0,
  ...over,
})

describe('playsFromInsights', () => {
  it('leva a view do insight para o item vinculado', () => {
    const updates = playsFromInsights({
      items: [item()],
      snapshots: [{ media_id: '111', views: 2137, captured_at: '2026-08-12T19:45:00Z' }],
    })

    expect(updates).toEqual([{ id: 'i1', profileId: 'p1', plays: 2137, views: 2137 }])
  })

  it('vence o snapshot mais recente, não o último da lista', () => {
    const updates = playsFromInsights({
      items: [item()],
      snapshots: [
        { media_id: '111', views: 2137, captured_at: '2026-08-12T19:45:00Z' },
        { media_id: '111', views: 900, captured_at: '2026-08-10T10:00:00Z' },
      ],
    })

    expect(updates[0].plays).toBe(2137)
  })

  it('não zera item cujo insight ainda não foi coletado', () => {
    // Post antigo: a Graph não devolve insight retroativo. O número que já
    // estava lá vale mais que um zero novo.
    const updates = playsFromInsights({
      items: [item({ plays: 5000, views: 5000 })],
      snapshots: [],
    })

    expect(updates).toEqual([])
  })

  it('ignora item sem vínculo de mídia — post de terceiro não tem insight nosso', () => {
    const updates = playsFromInsights({
      items: [item({ platform_media_id: null, plays: 112806 })],
      snapshots: [{ media_id: '111', views: 2137, captured_at: '2026-08-12T19:45:00Z' }],
    })

    expect(updates).toEqual([])
  })

  it('não reescreve linha idêntica', () => {
    const updates = playsFromInsights({
      items: [item({ plays: 2137, views: 2137 })],
      snapshots: [{ media_id: '111', views: 2137, captured_at: '2026-08-12T19:45:00Z' }],
    })

    expect(updates).toEqual([])
  })

  it('escreve quando só uma das duas colunas está certa', () => {
    const updates = playsFromInsights({
      items: [item({ plays: 2137, views: 0 })],
      snapshots: [{ media_id: '111', views: 2137, captured_at: '2026-08-12T19:45:00Z' }],
    })

    expect(updates).toEqual([{ id: 'i1', profileId: 'p1', plays: 2137, views: 2137 }])
  })

  it('insight com views nula ou zero não vira escrita', () => {
    const updates = playsFromInsights({
      items: [item(), item({ id: 'i2', platform_media_id: '222' })],
      snapshots: [
        { media_id: '111', views: null, captured_at: '2026-08-12T19:45:00Z' },
        { media_id: '222', views: 0, captured_at: '2026-08-12T19:45:00Z' },
      ],
    })

    expect(updates).toEqual([])
  })

  it('numérico vindo como string do Postgres não vira escrita repetida', () => {
    // `bigint` chega como string no supabase-js. Comparação frouxa aqui
    // reescreveria as mesmas linhas em todo tick.
    const updates = playsFromInsights({
      items: [item({ plays: '2137', views: '2137' })],
      snapshots: [{ media_id: '111', views: 2137, captured_at: '2026-08-12T19:45:00Z' }],
    })

    expect(updates).toEqual([])
  })
})
