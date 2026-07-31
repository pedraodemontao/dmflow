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
      {
        type: 'carousel',
        cards: [{ title: 'Card 1', subtitle: 'Descrição', imageUrl: 'https://exemplo.com/a.jpg' }],
        next: null,
      },
      { type: 'bubbles', bubbles: [{ text: 'Oi!' }, { text: 'Tudo bem?' }], pauseMs: 1200, next: null },
      { type: 'image', url: 'https://exemplo.com/a.jpg', next: null },
      { type: 'video', url: 'https://exemplo.com/a.mp4', next: null },
      { type: 'audio', url: 'https://exemplo.com/a.mp3', next: null },
      { type: 'file', url: 'https://exemplo.com/a.pdf', caption: 'O material', next: null },
      { type: 'ask', text: 'seu email?', saveAs: 'email', expect: 'email', next: null },
      { type: 'wait_reply', saveAs: 'r', next: null },
      { type: 'condition', cases: [{ source: 'last_input', op: 'contains', value: 'sim', next: null }] },
      { type: 'delay', seconds: 60, next: null },
      { type: 'tag', add: ['lead'], next: null },
      { type: 'set_field', fields: [{ key: 'origem', value: 'ig' }], next: null },
      { type: 'randomize', paths: [{ label: 'A', next: null }, { label: 'B', next: null }] },
      { type: 'http', url: 'https://exemplo.com', method: 'POST', next: null },
      { type: 'goto_flow', flowId: '11111111-1111-4111-8111-111111111111' },
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

  it('exige URL válida em vídeo, áudio e arquivo — mesmo motivo da imagem', () => {
    expect(flowNodeSchema.safeParse({ type: 'video', url: 'https://' }).success).toBe(false)
    expect(flowNodeSchema.safeParse({ type: 'audio', url: 'https://' }).success).toBe(false)
    expect(flowNodeSchema.safeParse({ type: 'file', url: 'https://' }).success).toBe(false)
  })

  it('aceita legenda opcional em vídeo, áudio e arquivo, igual à imagem', () => {
    const withCaption = flowNodeSchema.safeParse({
      type: 'video',
      url: 'https://exemplo.com/a.mp4',
      caption: 'Assista até o fim',
      next: null,
    })
    expect(withCaption.success).toBe(true)

    const withoutCaption = flowNodeSchema.safeParse({
      type: 'file',
      url: 'https://exemplo.com/a.pdf',
      next: null,
    })
    expect(withoutCaption.success).toBe(true)
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

  it('limita o carrossel a 10 cards, o teto do generic template', () => {
    const cards = Array.from({ length: 11 }, (_, i) => ({ title: `Card ${i}` }))
    expect(flowNodeSchema.safeParse({ type: 'carousel', cards, next: null }).success).toBe(false)
  })

  it('exige ao menos um card no carrossel', () => {
    expect(flowNodeSchema.safeParse({ type: 'carousel', cards: [], next: null }).success).toBe(false)
  })

  it('limita botões a 3 dentro de cada card do carrossel', () => {
    const buttons = [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }]
    const cards = [{ title: 'Card 1', buttons }]
    expect(flowNodeSchema.safeParse({ type: 'carousel', cards, next: null }).success).toBe(false)
  })

  it('exige ao menos duas bolhas — uma só é o bloco message', () => {
    expect(
      flowNodeSchema.safeParse({ type: 'bubbles', bubbles: [{ text: 'oi' }], next: null }).success,
    ).toBe(false)
  })

  it('limita bolhas a 5 e aplica a pausa padrão entre elas', () => {
    const bubbles = Array.from({ length: 6 }, (_, i) => ({ text: `bolha ${i}` }))
    expect(flowNodeSchema.safeParse({ type: 'bubbles', bubbles, next: null }).success).toBe(false)

    const parsed = flowNodeSchema.parse({
      type: 'bubbles',
      bubbles: [{ text: 'oi' }, { text: 'tudo bem?' }],
    })
    expect(parsed).toMatchObject({ pauseMs: 1200 })
  })

  it('exige um id de fluxo válido (uuid) no pular-para-outro-fluxo', () => {
    expect(flowNodeSchema.safeParse({ type: 'goto_flow', flowId: 'não-é-uuid' }).success).toBe(false)
    expect(
      flowNodeSchema.safeParse({
        type: 'goto_flow',
        flowId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true)
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
