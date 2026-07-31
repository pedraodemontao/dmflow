import { describe, expect, it } from 'vitest'

import {
  byteLength,
  charLength,
  flowDefinitionSchema,
  flowNodeSchema,
  META_LIMITS,
  truncateBytes,
  truncateChars,
} from '@/lib/flow/types'

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
      { type: 'audio', url: 'https://exemplo.com/a.m4a', next: null },
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

  /**
   * Limites da Meta: estourar qualquer um deles não trunca a mensagem do outro
   * lado, faz a Meta RECUSAR a mensagem inteira (erro 100). O fluxo morre no
   * meio, com o que veio antes já entregue.
   */
  it('recusa card de carrossel só com título — a Meta exige algo além dele', () => {
    const soTitulo = { type: 'carousel', cards: [{ title: 'Oferta' }], next: null }
    expect(flowNodeSchema.safeParse(soTitulo).success).toBe(false)

    const completos = [
      { title: 'Oferta', subtitle: 'Só hoje' },
      { title: 'Oferta', imageUrl: 'https://exemplo.com/a.jpg' },
      { title: 'Oferta', buttons: [{ title: 'Quero' }] },
    ]
    for (const card of completos) {
      expect(
        flowNodeSchema.safeParse({ type: 'carousel', cards: [card], next: null }).success,
        `card com ${Object.keys(card).join('+')}`,
      ).toBe(true)
    }
  })

  it('mede o texto em bytes, não em caracteres — acento e emoji custam mais de um', () => {
    // 600 caracteres acentuados = 1200 bytes: passaria num `.max(1000)` de
    // caracteres e a Meta recusaria mesmo assim.
    const acentuado = 'ç'.repeat(600)
    expect(charLength(acentuado)).toBeLessThan(META_LIMITS.TEXT_BYTES)
    expect(byteLength(acentuado)).toBeGreaterThan(META_LIMITS.TEXT_BYTES)
    expect(flowNodeSchema.safeParse({ type: 'message', text: acentuado }).success).toBe(false)

    const cabe = 'a'.repeat(META_LIMITS.TEXT_BYTES)
    expect(flowNodeSchema.safeParse({ type: 'message', text: cabe }).success).toBe(true)
    expect(flowNodeSchema.safeParse({ type: 'message', text: `${cabe}a` }).success).toBe(false)
  })

  it('aplica o limite de bytes em bolha, pergunta, repergunta e legenda de mídia', () => {
    const longo = 'a'.repeat(META_LIMITS.TEXT_BYTES + 1)

    expect(
      flowNodeSchema.safeParse({ type: 'bubbles', bubbles: [{ text: 'oi' }, { text: longo }] })
        .success,
    ).toBe(false)
    expect(
      flowNodeSchema.safeParse({ type: 'ask', text: longo, saveAs: 'r' }).success,
    ).toBe(false)
    expect(
      flowNodeSchema.safeParse({ type: 'ask', text: 'oi', saveAs: 'r', retryText: longo }).success,
    ).toBe(false)
    expect(
      flowNodeSchema.safeParse({ type: 'file', url: 'https://x.com/a.pdf', caption: longo }).success,
    ).toBe(false)
  })

  /**
   * O texto cresce depois desta validação — o engine sorteia o spintax na hora
   * do envio. Medir o template cru rejeitaria texto legítimo, e variante de
   * spintax é obrigatória para ativar automação neste projeto.
   */
  it('mede a MAIOR expansão do spintax, não o template cru', () => {
    const variante = 'a'.repeat(900)
    const template = `{${variante}|${variante}|${variante}}`

    expect(byteLength(template)).toBeGreaterThan(META_LIMITS.TEXT_BYTES)
    expect(flowNodeSchema.safeParse({ type: 'message', text: template }).success).toBe(true)

    const estoura = `{${'a'.repeat(200)}|${'a'.repeat(1001)}}`
    expect(flowNodeSchema.safeParse({ type: 'message', text: estoura }).success).toBe(false)
  })

  it('limita o texto do bloco de botões a 640 caracteres — outro campo, outro teto', () => {
    const botoes = [{ title: 'A' }]
    const noLimite = 'ç'.repeat(META_LIMITS.BUTTON_TEMPLATE_CHARS)

    // 640 caracteres acentuados passam de 1000 bytes e continuam válidos aqui:
    // o button template conta caracteres, não bytes.
    expect(byteLength(noLimite)).toBeGreaterThan(META_LIMITS.TEXT_BYTES)
    expect(flowNodeSchema.safeParse({ type: 'buttons', text: noLimite, buttons: botoes }).success).toBe(true)
    expect(
      flowNodeSchema.safeParse({ type: 'buttons', text: `${noLimite}ç`, buttons: botoes }).success,
    ).toBe(false)

    // A opção mais longa do spintax muda com a régua: `ç×400` é maior em bytes
    // (800) e `a×700` é maior em caracteres. Medir por bytes aqui deixaria
    // passar um texto de 700 caracteres.
    const reguaTrocada = `{${'ç'.repeat(400)}|${'a'.repeat(700)}}`
    expect(
      flowNodeSchema.safeParse({ type: 'buttons', text: reguaTrocada, buttons: botoes }).success,
    ).toBe(false)
  })

  it('limita o payload do postback a 1000 caracteres', () => {
    const payload = 'x'.repeat(META_LIMITS.POSTBACK_PAYLOAD_CHARS + 1)
    expect(
      flowNodeSchema.safeParse({ type: 'buttons', text: 'oi', buttons: [{ title: 'A', payload }] })
        .success,
    ).toBe(false)
    expect(
      flowNodeSchema.safeParse({
        type: 'buttons',
        text: 'oi',
        buttons: [{ title: 'A', payload: 'x'.repeat(META_LIMITS.POSTBACK_PAYLOAD_CHARS) }],
      }).success,
    ).toBe(true)
  })

  it('recusa formato de mídia fora da lista da Meta — mp3 é a pegadinha do áudio', () => {
    expect(flowNodeSchema.safeParse({ type: 'audio', url: 'https://x.com/a.mp3' }).success).toBe(false)
    expect(flowNodeSchema.safeParse({ type: 'audio', url: 'https://x.com/a.wav' }).success).toBe(true)
    expect(flowNodeSchema.safeParse({ type: 'image', url: 'https://x.com/a.gif' }).success).toBe(false)
    expect(flowNodeSchema.safeParse({ type: 'image', url: 'https://x.com/a.jpeg' }).success).toBe(true)
    expect(flowNodeSchema.safeParse({ type: 'video', url: 'https://x.com/a.mkv' }).success).toBe(false)
    expect(flowNodeSchema.safeParse({ type: 'video', url: 'https://x.com/a.webm' }).success).toBe(true)
    // `file` aceita só pdf — nem docx, nem zip.
    expect(flowNodeSchema.safeParse({ type: 'file', url: 'https://x.com/a.docx' }).success).toBe(false)
    expect(flowNodeSchema.safeParse({ type: 'file', url: 'https://x.com/a.pdf' }).success).toBe(true)
  })

  it('ignora query string e aceita URL sem extensão nenhuma', () => {
    // Link assinado: a extensão está no caminho, o token vem depois.
    expect(
      flowNodeSchema.safeParse({ type: 'file', url: 'https://x.com/material.pdf?token=abc' }).success,
    ).toBe(true)
    expect(
      flowNodeSchema.safeParse({ type: 'audio', url: 'https://x.com/a.mp3?token=abc' }).success,
    ).toBe(false)
    // Sem extensão passa: storage/CDN costuma não ter uma e a Meta resolve pelo
    // Content-Type. Recusar barraria link que funciona.
    expect(
      flowNodeSchema.safeParse({ type: 'image', url: 'https://x.com/storage/object/sign/abc123' })
        .success,
    ).toBe(true)
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

/**
 * O corte no envio (`instagram/api.ts`) é a segunda defesa: `{{nome}}` só é
 * conhecido em tempo de execução, então o texto que o schema aprovou não é o
 * que sai. Corte errado quebra em silêncio — emoji partido ao meio vira UTF-8
 * inválido e a Meta recusa a mensagem do mesmo jeito.
 */
describe('corte no limite da Meta', () => {
  it('corta por bytes sem partir caractere multibyte', () => {
    const texto = 'çç'
    expect(byteLength(texto)).toBe(4)
    // 3 bytes não cabem dois `ç`: sai um só, inteiro.
    expect(truncateBytes(texto, 3)).toBe('ç')
    expect(byteLength(truncateBytes('ç'.repeat(600), META_LIMITS.TEXT_BYTES))).toBeLessThanOrEqual(
      META_LIMITS.TEXT_BYTES,
    )
  })

  it('não parte emoji ao meio — `slice` partiria', () => {
    const emoji = '🔥🔥'
    expect('🔥🔥'.slice(0, 3)).not.toBe('🔥')
    expect(truncateBytes(emoji, 5)).toBe('🔥')
    expect(truncateChars(emoji, 1)).toBe('🔥')
  })

  it('devolve o texto intacto quando já cabe', () => {
    expect(truncateBytes('oi', META_LIMITS.TEXT_BYTES)).toBe('oi')
    expect(truncateChars('oi', META_LIMITS.BUTTON_TITLE_CHARS)).toBe('oi')
  })

  it('conta caractere como gente conta: emoji é um, não dois', () => {
    expect('🔥'.length).toBe(2)
    expect(charLength('🔥')).toBe(1)
    expect(charLength(truncateChars('🔥'.repeat(30), 20))).toBe(20)
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
