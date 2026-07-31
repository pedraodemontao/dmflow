import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de engine para os três blocos novos (carrossel, pular-para-outro-
 * fluxo, várias bolhas). O `goto_flow` é o mais arriscado: troca a definição
 * de fluxo NO MEIO do `walk()`, então o que mais importa testar é que o
 * `flow_id` do run é persistido e que o MAX_STEPS ainda trava um ciclo entre
 * fluxos que se chamam de volta.
 *
 * Supabase e Instagram são simulados, como em `engine.test.ts`.
 */

// `goto_flow.flowId` é validado como uuid de verdade (versão e variante
// corretas) — id "bonitinho" tipo "flow-a" falha no schema antes de chegar
// no engine.
const FLOW_A_ID = '11111111-1111-4111-8111-111111111111'
const FLOW_B_ID = '22222222-2222-4222-8222-222222222222'
const MISSING_FLOW_ID = '33333333-3333-4333-8333-333333333333'

const sent: Array<{ kind: string; text: string }> = []
const runUpdates: Array<Record<string, unknown>> = []

type FlowRow = { id: string; account_id: string; name: string; definition: unknown }
let flows: Record<string, FlowRow>

/** Encadeamento mínimo do PostgREST usado pelo engine, com suporte a mais de um fluxo. */
function fakeQuery(table: string) {
  const builder: Record<string, unknown> = {}
  const filters: Record<string, string> = {}
  const chain = () => builder

  builder.select = chain
  builder.eq = (col: string, value: string) => {
    filters[col] = value
    return builder
  }
  builder.in = chain
  builder.gte = chain
  builder.order = chain
  builder.limit = chain

  builder.insert = (payload: unknown) => {
    if (table === 'messages') {
      const row = payload as { text?: string }
      sent.push({ kind: 'message-row', text: row.text ?? '' })
    }
    // `.select()` depois de `.insert()` precisa devolver algo cujo `.single()`
    // já sabe responder o novo run — não o builder genérico (que devolve null).
    const afterInsert: Record<string, unknown> = {
      ...builder,
      single: async () => ({ data: { id: 'run-1' } }),
    }
    afterInsert.select = () => afterInsert
    return afterInsert
  }

  builder.update = (payload: Record<string, unknown>) => {
    if (table === 'flow_runs') runUpdates.push(payload)
    return builder
  }

  builder.maybeSingle = async () => {
    if (table === 'flows') {
      const row = Object.values(flows).find(
        (f) => f.id === filters.id && (!filters.account_id || f.account_id === filters.account_id),
      )
      return { data: row ?? null }
    }
    // flow_runs: nunca há um run "ativo" concorrente nestes testes.
    return { data: null }
  }
  builder.single = async () => ({ data: null })
  builder.then = (resolve: (value: { data: unknown; count: number }) => unknown) =>
    resolve({ data: [], count: 0 })

  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

vi.mock('@/lib/instagram/api', () => ({
  sendText: async (args: { text: string }) => {
    sent.push({ kind: 'dm', text: args.text })
    return {}
  },
  sendButtons: async (args: { text: string }) => {
    sent.push({ kind: 'buttons', text: args.text })
    return {}
  },
  sendImage: async () => {
    sent.push({ kind: 'image', text: '' })
    return {}
  },
  sendCarousel: async (args: { cards: Array<{ title: string }> }) => {
    sent.push({ kind: 'carousel', text: args.cards.map((c) => c.title).join(' · ') })
    return {}
  },
  sendPrivateReply: async (args: { text: string }) => {
    sent.push({ kind: 'private_reply', text: args.text })
    return {}
  },
}))

vi.mock('@/lib/flow/send-cap', () => ({
  assertUnderSendCap: async () => {},
  logSend: async () => {},
  SendCapError: class SendCapError extends Error {},
}))

const { startFlow } = await import('@/lib/flow/engine')

const account = { id: 'acc-1', ig_user_id: 'ig-1', access_token: 't' }

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    ig_user_id: 'lead-1',
    username: 'lead',
    name: 'Lead',
    tags: [],
    fields: {},
    subscribed: true,
    last_inbound_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  sent.length = 0
  runUpdates.length = 0

  flows = {
    'flow-a': { id: FLOW_A_ID, account_id: 'acc-1', name: 'fluxo A', definition: {} },
    'flow-b': {
      id: FLOW_B_ID,
      account_id: 'acc-1',
      name: 'fluxo B',
      definition: {
        entry: 'chegou',
        nodes: { chegou: { type: 'message', text: 'Chegou no fluxo B!', next: null } },
      },
    },
  }
})

describe('bloco goto_flow', () => {
  it('troca o flow_id do run e continua executando a definição do fluxo de destino', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: { inicio: { type: 'goto_flow', flowId: FLOW_B_ID } },
    }

    await startFlow({ account: account as never, flow: flows['flow-a'] as never, contact: contact() as never })

    expect(sent.some((s) => s.kind === 'dm' && s.text === 'Chegou no fluxo B!')).toBe(true)
    expect(runUpdates.some((u) => u.flow_id === FLOW_B_ID)).toBe(true)
  })

  it('falha com erro claro quando o fluxo de destino não existe', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: { inicio: { type: 'goto_flow', flowId: MISSING_FLOW_ID } },
    }

    await expect(
      startFlow({
        account: account as never,
        flow: flows['flow-a'] as never,
        contact: contact() as never,
      }),
    ).rejects.toThrow(/não existe/)
  })

  it('MAX_STEPS trava um ciclo de fluxos que pulam um para o outro', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: { inicio: { type: 'goto_flow', flowId: FLOW_B_ID } },
    }
    flows['flow-b'].definition = {
      entry: 'volta',
      nodes: { volta: { type: 'goto_flow', flowId: FLOW_A_ID } },
    }

    // Sem a trava, este await nunca resolveria — é isso que o teste prova.
    await expect(
      startFlow({
        account: account as never,
        flow: flows['flow-a'] as never,
        contact: contact() as never,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('bloco carousel', () => {
  it('manda os cards por sendCarousel quando a janela de 24h está aberta', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: {
        inicio: {
          type: 'carousel',
          cards: [
            {
              title: 'Produto 1',
              subtitle: 'Descrição',
              imageUrl: 'https://exemplo.com/1.jpg',
              buttons: [{ title: 'Comprar', url: 'https://loja.com/1' }],
            },
          ],
          next: null,
        },
      },
    }

    await startFlow({ account: account as never, flow: flows['flow-a'] as never, contact: contact() as never })

    expect(sent.some((s) => s.kind === 'carousel' && s.text === 'Produto 1')).toBe(true)
  })

  it('usa private reply quando o fluxo nasceu de um comentário', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: { inicio: { type: 'carousel', cards: [{ title: 'Produto 1' }], next: null } },
    }

    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      // Janela fechada de propósito: só a private reply consegue entregar.
      contact: contact({ last_inbound_at: null }) as never,
      commentId: 'comment-1',
    })

    expect(sent.some((s) => s.kind === 'private_reply')).toBe(true)
    expect(sent.some((s) => s.kind === 'carousel')).toBe(false)
  })

  it('recusa enviar fora da janela de 24h sem ser origem de comentário', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: { inicio: { type: 'carousel', cards: [{ title: 'Produto 1' }], next: null } },
    }

    await expect(
      startFlow({
        account: account as never,
        flow: flows['flow-a'] as never,
        contact: contact({ last_inbound_at: null }) as never,
      }),
    ).rejects.toThrow(/Janela de 24h/)
  })
})

describe('bloco bubbles', () => {
  it('manda cada bolha como mensagem separada, na ordem', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: {
        inicio: {
          type: 'bubbles',
          bubbles: [{ text: 'Oi!' }, { text: 'Vi seu comentário' }, { text: 'Já te explico' }],
          // Pausa no mínimo permitido pelo schema, para o teste não esperar de verdade.
          pauseMs: 300,
          next: null,
        },
      },
    }

    await startFlow({ account: account as never, flow: flows['flow-a'] as never, contact: contact() as never })

    expect(sent.filter((s) => s.kind === 'dm').map((s) => s.text)).toEqual([
      'Oi!',
      'Vi seu comentário',
      'Já te explico',
    ])
  })
})
