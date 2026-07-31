import { describe, expect, it } from 'vitest'

import { flowDefinitionSchema, flowNodeSchema } from '@/lib/flow/types'

/**
 * O schema é o contrato entre o builder e o engine: fluxo salvo no banco é
 * validado por ele a cada execução. Bloco novo que não parseia derruba o
 * fluxo inteiro em produção, não só o bloco.
 */
describe('flowNodeSchema', () => {
  it('aceita todos os tipos de bloco existentes', () => {
    const nodes = [
      { type: 'message', text: 'oi', next: null },
      { type: 'buttons', text: 'escolha', buttons: [{ title: 'A' }], next: null },
      { type: 'image', url: 'https://exemplo.com/a.jpg', next: null },
      { type: 'ask', text: 'seu email?', saveAs: 'email', expect: 'email', next: null },
      { type: 'wait_reply', saveAs: 'r', next: null },
      { type: 'condition', cases: [{ source: 'last_input', op: 'contains', value: 'sim', next: null }] },
      { type: 'delay', seconds: 60, next: null },
      { type: 'tag', add: ['lead'], next: null },
      { type: 'set_field', fields: [{ key: 'origem', value: 'ig' }], next: null },
      { type: 'randomize', paths: [{ label: 'A', next: null }, { label: 'B', next: null }] },
      { type: 'http', url: 'https://exemplo.com', method: 'POST', next: null },
      { type: 'unsubscribe', next: null },
      { type: 'end' },
    ]

    for (const node of nodes) {
      expect(flowNodeSchema.safeParse(node).success, `bloco ${node.type}`).toBe(true)
    }
  })

  it('aplica os padrões do bloco ask', () => {
    const parsed = flowNodeSchema.parse({ type: 'ask', text: 'oi', saveAs: 'r' })
    expect(parsed).toMatchObject({ expect: 'text', maxRetries: 2 })
  })

  it('recusa bloco de tipo desconhecido', () => {
    expect(flowNodeSchema.safeParse({ type: 'telepatia', next: null }).success).toBe(false)
  })

  it('exige URL válida na imagem — link quebrado falha no envio real', () => {
    expect(flowNodeSchema.safeParse({ type: 'image', url: 'https://' }).success).toBe(false)
  })

  it('exige ao menos dois caminhos no sorteio', () => {
    expect(
      flowNodeSchema.safeParse({ type: 'randomize', paths: [{ label: 'A', next: null }] }).success,
    ).toBe(false)
  })

  it('limita o delay a 20 horas — acima disso a janela de 24h já fechou', () => {
    expect(flowNodeSchema.safeParse({ type: 'delay', seconds: 60 * 60 * 21 }).success).toBe(false)
  })

  it('limita botões a 3, que é o teto do Instagram', () => {
    const buttons = [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }]
    expect(flowNodeSchema.safeParse({ type: 'buttons', text: 'x', buttons }).success).toBe(false)
  })
})

describe('flowDefinitionSchema', () => {
  it('aceita a forma mínima de um fluxo', () => {
    const parsed = flowDefinitionSchema.safeParse({
      entry: 'inicio',
      nodes: { inicio: { type: 'message', text: 'oi', next: null } },
    })
    expect(parsed.success).toBe(true)
  })

  it('recusa fluxo sem entrada', () => {
    expect(flowDefinitionSchema.safeParse({ entry: '', nodes: {} }).success).toBe(false)
  })

  it('mantém o layout do canvas, que o engine ignora', () => {
    const parsed = flowDefinitionSchema.parse({
      entry: 'a',
      nodes: { a: { type: 'end' } },
      layout: { a: { x: 10, y: 20 } },
    })
    expect(parsed.layout).toEqual({ a: { x: 10, y: 20 } })
  })
})
