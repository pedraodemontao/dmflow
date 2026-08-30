import { describe, expect, it, vi } from 'vitest'

// `pickSource` é pura, mas o módulo importa `@/lib/data` (server-only) para
// o carregador. Simular os três módulos de servidor é o que deixa o teste
// rodar sem banco — o carregador em si é exercitado contra a conta real.
vi.mock('@/lib/data', () => ({ getAccount: async () => null }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))
vi.mock('@/lib/ai/context', () => ({ loadModelingContext: async () => ({ ok: false, problem: 'sem-conta' }) }))

const { pickSource } = await import('@/lib/ai/carousel-context')

describe('pickSource', () => {
  it('roteiro ganha do item: é o pedido mais específico', () => {
    expect(pickSource({ scriptId: 's', libraryItemId: 'i' })).toBe('script')
  })

  it('item sem roteiro modela no vídeo', () => {
    expect(pickSource({ scriptId: null, libraryItemId: 'i' })).toBe('item')
  })

  it('sem os dois é tema livre', () => {
    expect(pickSource({ scriptId: undefined, libraryItemId: undefined })).toBe('free')
  })
})
