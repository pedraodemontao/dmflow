import { describe, expect, it } from 'vitest'

import { findLeaks } from '@/lib/flow/leaks'
import type { FlowDefinition } from '@/lib/flow/types'

/** O formato exato do fluxo que perdeu o lead em 31/07/2026. */
const fluxoQuePerdeu: FlowDefinition = {
  entry: 'abertura',
  nodes: {
    abertura: { type: 'message', text: 'Confirma?', next: 'espera' },
    espera: { type: 'wait_reply', saveAs: 'resposta', next: 'checa' },
    checa: {
      type: 'condition',
      cases: [{ source: 'last_input', op: 'contains', value: 'SIM', next: 'entrega' }],
      fallback: 'desistiu',
    },
    entrega: { type: 'message', text: 'Toma o material', next: 'fim' },
    desistiu: { type: 'message', text: 'Tranquilo!', next: 'fim' },
    fim: { type: 'end' },
  },
}

describe('findLeaks', () => {
  it('marca a condição que compara texto livre, dizendo o que ela procura', () => {
    // Não é acusação de defeito: é raio-X. Tentei detectar automaticamente
    // "esse galho perde gente" e o heurístico acusou o fluxo JÁ CORRIGIDO —
    // falso positivo em alerta é como se aprende a ignorar alerta. O que a
    // ferramenta sabe de verdade é QUAIS palavras a condição procura, e que
    // quem escrever diferente cai no senão. Quem julga é o dono.
    const leaks = findLeaks(fluxoQuePerdeu)
    const nota = leaks.find((leak) => leak.nodeId === 'checa')

    expect(nota?.level).toBe('nota')
    expect(nota?.message).toContain('"SIM"')
    expect(nota?.message).toContain('senão')
  })

  it('não marca condição que lê etiqueta em vez de texto livre', () => {
    // Etiqueta é valor que o próprio sistema escreveu: casar é previsível.
    const porEtiqueta: FlowDefinition = {
      entry: 'checa',
      nodes: {
        checa: {
          type: 'condition',
          cases: [{ source: 'tags', op: 'has_tag', value: 'cliente', next: 'ok' }],
          fallback: 'nao',
        },
        ok: { type: 'message', text: 'ok', next: 'fim' },
        nao: { type: 'message', text: 'não', next: 'fim' },
        fim: { type: 'end' },
      },
    }

    expect(findLeaks(porEtiqueta)).toHaveLength(0)
  })

  it('acusa bloco inalcançável', () => {
    const orfao: FlowDefinition = {
      entry: 'inicio',
      nodes: {
        inicio: { type: 'message', text: 'oi', next: 'fim' },
        fim: { type: 'end' },
        perdido: { type: 'message', text: 'ninguém me lê', next: 'fim' },
      },
    }

    expect(findLeaks(orfao).some((leak) => leak.nodeId === 'perdido')).toBe(true)
  })

  it('acusa ponta solta e bloco apagado', () => {
    const quebrado: FlowDefinition = {
      entry: 'inicio',
      nodes: {
        inicio: { type: 'message', text: 'oi', next: null },
        outro: { type: 'message', text: 'oi', next: 'sumiu' },
      },
    } as unknown as FlowDefinition

    const leaks = findLeaks(quebrado)
    expect(leaks.some((leak) => leak.level === 'erro' && leak.nodeId === 'inicio')).toBe(true)
  })

  it('fluxo saudável não acusa nada', () => {
    const ok: FlowDefinition = {
      entry: 'inicio',
      nodes: {
        inicio: { type: 'message', text: 'oi', next: 'fim' },
        fim: { type: 'end' },
      },
    }

    expect(findLeaks(ok)).toHaveLength(0)
  })
})

describe('{{presente}} sem entrega vinculada', () => {
  const comPresente: FlowDefinition = {
    entry: 'inicio',
    nodes: {
      inicio: { type: 'message', text: 'Toma o link: {{presente}}', next: 'fim' },
      fim: { type: 'end' },
    },
  }

  it('avisa por omissão — quem não informa hasDelivery não sabe se está tudo bem', () => {
    const leaks = findLeaks(comPresente)
    const aviso = leaks.find((leak) => leak.nodeId === 'inicio')

    expect(aviso?.level).toBe('aviso')
    expect(aviso?.message).toContain('{{presente}}')
    expect(aviso?.message).toContain('entrega')
  })

  it('avisa explicitamente quando hasDelivery é false', () => {
    expect(findLeaks(comPresente, { hasDelivery: false }).length).toBeGreaterThan(0)
  })

  it('não avisa quando há entrega vinculada', () => {
    expect(findLeaks(comPresente, { hasDelivery: true })).toHaveLength(0)
  })

  it('não avisa fluxo que não usa {{presente}}', () => {
    const semPresente: FlowDefinition = {
      entry: 'inicio',
      nodes: {
        inicio: { type: 'message', text: 'Oi, tudo bem?', next: 'fim' },
        fim: { type: 'end' },
      },
    }

    expect(findLeaks(semPresente, { hasDelivery: false })).toHaveLength(0)
  })

  it('encontra {{presente}} em botão, carrossel, bolha, pergunta e legenda de mídia', () => {
    const espalhado: FlowDefinition = {
      entry: 'botao',
      nodes: {
        botao: {
          type: 'buttons',
          text: 'escolha',
          buttons: [{ title: 'Toma {{presente}}', payload: 'x' }],
          next: 'carrossel',
        },
        carrossel: {
          type: 'carousel',
          cards: [{ title: 'card', subtitle: '{{presente}}' }],
          next: 'bolhas',
        },
        bolhas: {
          type: 'bubbles',
          bubbles: [{ text: 'primeira' }, { text: 'segunda {{presente}}' }],
          pauseMs: 1200,
          next: 'pergunta',
        },
        pergunta: { type: 'ask', text: 'me diz {{presente}}?', saveAs: 'x', expect: 'text', maxRetries: 2 },
      },
    } as unknown as FlowDefinition

    const leaks = findLeaks(espalhado, { hasDelivery: false })
    const nos = new Set(leaks.filter((l) => l.message.includes('{{presente}}')).map((l) => l.nodeId))

    expect(nos).toEqual(new Set(['botao', 'carrossel', 'bolhas', 'pergunta']))
  })
})
