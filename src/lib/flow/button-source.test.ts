import { describe, expect, it } from 'vitest'

import { listButtonNodes, resolveButtonSource, payloadForTitle } from '@/lib/flow/button-source'
import { flowDefinitionSchema } from '@/lib/flow/types'

/**
 * A resolução do payload é a peça que quebra em silêncio: errar a origem não
 * derruba nada, só faz a tela de métricas contar a escolha no bloco errado —
 * e ninguém tem como desconfiar olhando o painel.
 */

const buttonsFlow = {
  entry: 'oferta',
  nodes: {
    oferta: {
      type: 'buttons',
      text: 'Quer o mapa?',
      buttons: [
        { title: 'Quero o mapa', payload: 'QUERO_MAPA' },
        { title: 'Depois eu vejo', payload: 'DEPOIS' },
        { title: 'Ver no site', url: 'https://exemplo.com' },
      ],
    },
    fim: { type: 'end' },
  },
}

const quickReplyFlow = {
  entry: 'pergunta',
  nodes: {
    pergunta: {
      type: 'message',
      text: 'Prefere qual?',
      quickReplies: [
        { title: 'Manhã', payload: 'TURNO_MANHA' },
        { title: 'Noite', payload: 'TURNO_NOITE' },
      ],
    },
  },
}

const carouselFlow = {
  entry: 'vitrine',
  nodes: {
    vitrine: {
      type: 'carousel',
      cards: [
        {
          title: 'Plano básico',
          buttons: [{ title: 'Assinar básico', payload: 'PLANO_BASICO' }],
        },
        {
          title: 'Plano pro',
          buttons: [{ title: 'Assinar pro', payload: 'PLANO_PRO' }],
        },
      ],
    },
  },
}

describe('resolveButtonSource', () => {
  it('casa em um nó: devolve fluxo, bloco e o rótulo da definição', () => {
    const source = resolveButtonSource([{ id: 'flow-1', definition: buttonsFlow }], 'QUERO_MAPA')

    expect(source).toEqual({ flowId: 'flow-1', nodeId: 'oferta', title: 'Quero o mapa' })
  })

  it('casa em nenhum: registra o clique sem origem, em vez de perder o dado', () => {
    const source = resolveButtonSource(
      [{ id: 'flow-1', definition: buttonsFlow }],
      'BOTAO_APAGADO',
    )

    expect(source).toEqual({ flowId: null, nodeId: null, title: null })
  })

  it('payload em quick reply de bloco message', () => {
    const source = resolveButtonSource(
      [{ id: 'flow-2', definition: quickReplyFlow }],
      'TURNO_NOITE',
    )

    expect(source).toEqual({ flowId: 'flow-2', nodeId: 'pergunta', title: 'Noite' })
  })

  it('payload em botão de card de carrossel', () => {
    const source = resolveButtonSource([{ id: 'flow-3', definition: carouselFlow }], 'PLANO_PRO')

    expect(source).toEqual({ flowId: 'flow-3', nodeId: 'vitrine', title: 'Assinar pro' })
  })

  it('casa em dois blocos do mesmo fluxo: guarda o fluxo, zera o bloco', () => {
    const definition = {
      entry: 'a',
      nodes: {
        a: { type: 'buttons', text: 'oi', buttons: [{ title: 'Quero', payload: 'QUERO' }] },
        b: { type: 'buttons', text: 'de novo', buttons: [{ title: 'Quero', payload: 'QUERO' }] },
      },
    }

    const source = resolveButtonSource([{ id: 'flow-1', definition }], 'QUERO')

    // Rótulo idêntico nos dois: o texto continua sendo fato mesmo sem procedência.
    expect(source).toEqual({ flowId: 'flow-1', nodeId: null, title: 'Quero' })
  })

  it('casa em dois fluxos: zera fluxo e bloco, e o rótulo divergente também', () => {
    const outro = {
      entry: 'x',
      nodes: {
        x: { type: 'buttons', text: 'oi', buttons: [{ title: 'Outro texto', payload: 'QUERO_MAPA' }] },
      },
    }

    const source = resolveButtonSource(
      [
        { id: 'flow-1', definition: buttonsFlow },
        { id: 'flow-9', definition: outro },
      ],
      'QUERO_MAPA',
    )

    expect(source).toEqual({ flowId: null, nodeId: null, title: null })
  })

  it('o mesmo payload duas vezes no MESMO bloco não é ambiguidade de origem', () => {
    const definition = {
      entry: 'a',
      nodes: {
        a: {
          type: 'buttons',
          text: 'oi',
          buttons: [
            { title: 'Quero', payload: 'QUERO' },
            { title: 'Quero', payload: 'QUERO' },
          ],
        },
      },
    }

    const source = resolveButtonSource([{ id: 'flow-1', definition }], 'QUERO')

    expect(source).toEqual({ flowId: 'flow-1', nodeId: 'a', title: 'Quero' })
  })

  it('botão de link (sem payload) nunca casa — clique nele não volta para a Meta', () => {
    const source = resolveButtonSource([{ id: 'flow-1', definition: buttonsFlow }], '')

    expect(source).toEqual({ flowId: null, nodeId: null, title: null })
  })

  it('definição corrompida é pulada sem derrubar a varredura dos outros fluxos', () => {
    const source = resolveButtonSource(
      [
        { id: 'quebrado', definition: { nodes: 'isto não é um fluxo' } },
        { id: 'flow-1', definition: buttonsFlow },
      ],
      'DEPOIS',
    )

    expect(source).toEqual({ flowId: 'flow-1', nodeId: 'oferta', title: 'Depois eu vejo' })
  })
})

describe('listButtonNodes', () => {
  it('lista só os blocos que oferecem botão com payload, ignorando o de link', () => {
    const definition = flowDefinitionSchema.parse(buttonsFlow)

    expect(listButtonNodes(definition)).toEqual([
      {
        nodeId: 'oferta',
        nodeType: 'buttons',
        buttons: [
          { payload: 'QUERO_MAPA', title: 'Quero o mapa' },
          { payload: 'DEPOIS', title: 'Depois eu vejo' },
        ],
      },
    ])
  })

  it('junta os botões de todos os cards do carrossel num bloco só', () => {
    const definition = flowDefinitionSchema.parse(carouselFlow)

    expect(listButtonNodes(definition)).toEqual([
      {
        nodeId: 'vitrine',
        nodeType: 'carousel',
        buttons: [
          { payload: 'PLANO_BASICO', title: 'Assinar básico' },
          { payload: 'PLANO_PRO', title: 'Assinar pro' },
        ],
      },
    ])
  })

  it('fluxo sem botão nenhum devolve lista vazia — a seção não deve aparecer', () => {
    const definition = flowDefinitionSchema.parse({
      entry: 'a',
      nodes: { a: { type: 'message', text: 'oi' } },
    })

    expect(listButtonNodes(definition)).toEqual([])
  })
})

describe('payloadForTitle', () => {
  const flows = [
    {
      id: 'flow-a',
      definition: {
        entry: 'inicio',
        nodes: {
          inicio: {
            type: 'message',
            text: 'Quer o checklist?',
            quickReplies: [
              { title: 'Quero sim', payload: 'SIM' },
              { title: 'Agora não', payload: 'NAO' },
            ],
            next: null,
          },
        },
      },
    },
  ]

  it('traduz o título que o polling entrega para o payload declarado', () => {
    // O toque em quick reply chega como mensagem comum com o TÍTULO; sem esta
    // tradução, uma condição escrita contra "SIM" nunca casaria.
    expect(payloadForTitle(flows as never, 'Quero sim')).toBe('SIM')
    expect(payloadForTitle(flows as never, 'Agora não')).toBe('NAO')
  })

  it('ignora espaço em volta', () => {
    expect(payloadForTitle(flows as never, '  Quero sim  ')).toBe('SIM')
  })

  it('devolve nulo para texto que a pessoa digitou', () => {
    expect(payloadForTitle(flows as never, 'quero o checklist por favor')).toBeNull()
  })

  it('não traduz quando a caixa não bate', () => {
    // Igualdade exata de propósito: o título volta como saiu. Afrouxar aqui
    // traduziria por engano frase digitada pela pessoa.
    expect(payloadForTitle(flows as never, 'QUERO SIM')).toBeNull()
  })

  it('devolve nulo quando o mesmo título aponta para payloads diferentes', () => {
    const ambiguos = [
      flows[0],
      {
        id: 'flow-b',
        definition: {
          entry: 'inicio',
          nodes: {
            inicio: {
              type: 'message',
              text: 'Outro fluxo',
              quickReplies: [{ title: 'Quero sim', payload: 'OUTRO' }],
              next: null,
            },
          },
        },
      },
    ]

    // Chutar aqui mandaria a pessoa para o galho errado do fluxo.
    expect(payloadForTitle(ambiguos as never, 'Quero sim')).toBeNull()
  })

  it('devolve nulo para texto vazio', () => {
    expect(payloadForTitle(flows as never, '   ')).toBeNull()
  })
})
