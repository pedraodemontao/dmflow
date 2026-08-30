import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A clonagem de gatilho contra um Supabase simulado. O que importa guardar:
 * global não clona, retentativa não duplica, e post antigo continua com o
 * gatilho dele.
 */

let triggers: Array<Record<string, unknown>>
let inserted: Array<Record<string, unknown>>
let insertError: { message: string } | null

function fakeQuery() {
  const q: Record<string, unknown> = {}
  const chain = () => q
  q.select = chain
  q.eq = chain
  q.order = chain
  q.insert = async (row: Record<string, unknown>) => {
    if (insertError) return { error: insertError }
    inserted.push(row)
    return { error: null }
  }
  q.then = (resolve: (value: unknown) => unknown) => resolve({ data: triggers, error: null })
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => fakeQuery() },
}))

const { cloneTriggersForPublication } = await import('@/lib/publications/clone-triggers')

function trigger(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 't-1',
    account_id: 'acc-1',
    flow_id: 'flow-1',
    type: 'comment',
    keywords: ['aula'],
    match_mode: 'contains',
    media_id: 'post-velho',
    public_reply: '{Te mandei|Chegou} no direct',
    priority: 0,
    is_active: true,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  triggers = []
  inserted = []
  insertError = null
})

describe('cloneTriggersForPublication', () => {
  it('clona o gatilho preso com o media_id do post novo, preservando o antigo', async () => {
    triggers = [trigger()]

    const result = await cloneTriggersForPublication({ flowId: 'flow-1', mediaId: 'post-novo' })

    expect(result).toEqual({ cloned: 1, skipped: 0 })
    expect(inserted).toEqual([
      {
        account_id: 'acc-1',
        flow_id: 'flow-1',
        type: 'comment',
        keywords: ['aula'],
        match_mode: 'contains',
        media_id: 'post-novo',
        public_reply: '{Te mandei|Chegou} no direct',
        priority: 0,
        is_active: true,
      },
    ])
  })

  it('gatilho global (media_id nulo) já cobre o post novo: não clona', async () => {
    triggers = [trigger({ media_id: null })]

    const result = await cloneTriggersForPublication({ flowId: 'flow-1', mediaId: 'post-novo' })

    expect(result).toEqual({ cloned: 0, skipped: 1 })
    expect(inserted).toHaveLength(0)
  })

  it('retentativa não duplica: clone que já existe é pulado', async () => {
    triggers = [trigger({ id: 't-clone', media_id: 'post-novo' }), trigger()]

    const result = await cloneTriggersForPublication({ flowId: 'flow-1', mediaId: 'post-novo' })

    expect(result).toEqual({ cloned: 0, skipped: 2 })
    expect(inserted).toHaveLength(0)
  })

  it('três posts antigos com as mesmas palavras viram um clone só, com a configuração mais recente', async () => {
    triggers = [
      trigger({ id: 't-3', media_id: 'p3', public_reply: 'mais recente' }),
      trigger({ id: 't-2', media_id: 'p2', public_reply: 'antiga' }),
      trigger({ id: 't-1', media_id: 'p1', keywords: ['AULA '], public_reply: 'mais antiga' }),
    ]

    const result = await cloneTriggersForPublication({ flowId: 'flow-1', mediaId: 'post-novo' })

    expect(result).toEqual({ cloned: 1, skipped: 2 })
    expect(inserted[0]).toMatchObject({ public_reply: 'mais recente', media_id: 'post-novo' })
  })

  it('palavras diferentes são gatilhos diferentes', async () => {
    triggers = [trigger({ id: 'a', keywords: ['aula'] }), trigger({ id: 'b', keywords: ['mapa'] })]

    const result = await cloneTriggersForPublication({ flowId: 'flow-1', mediaId: 'post-novo' })

    expect(result.cloned).toBe(2)
  })

  it('erro do banco sobe — nunca vira array', async () => {
    triggers = [trigger()]
    insertError = { message: 'violates check constraint' }

    await expect(cloneTriggersForPublication({ flowId: 'flow-1', mediaId: 'post-novo' })).rejects.toThrow(
      'violates check constraint',
    )
  })
})
