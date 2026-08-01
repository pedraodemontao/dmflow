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

/** O que a Meta responde na consulta de perfil, e quantas vezes foi chamada. */
let profileResponse: { is_user_follow_business?: boolean } | null = null
let profileCalls = 0
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
  sendMedia: async (args: { type: string }) => {
    sent.push({ kind: args.type, text: '' })
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
  fetchContactProfile: async () => {
    profileCalls += 1
    return profileResponse
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
      // Card precisa de algo além do título, senão a Meta recusa a mensagem
      // inteira — o schema barra antes (ver `types.test.ts`).
      nodes: {
        inicio: {
          type: 'carousel',
          cards: [{ title: 'Produto 1', subtitle: 'Descrição' }],
          next: null,
        },
      },
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
      // Card precisa de algo além do título, senão a Meta recusa a mensagem
      // inteira — o schema barra antes (ver `types.test.ts`).
      nodes: {
        inicio: {
          type: 'carousel',
          cards: [{ title: 'Produto 1', subtitle: 'Descrição' }],
          next: null,
        },
      },
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

/**
 * Vídeo, áudio e arquivo compartilham o mesmo `deliverMedia` do engine (e o
 * mesmo `sendMedia` da API) que o bloco de imagem já usava — o que muda é só
 * o `type` do anexo. Um caso por tipo garante que o `type` certo chega até a
 * chamada da API.
 */
describe.each([
  ['video', 'video'] as const,
  ['audio', 'audio'] as const,
  ['file', 'file'] as const,
])('bloco %s', (nodeType, mediaKind) => {
  it('manda o anexo por sendMedia com o type certo quando a janela está aberta', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: {
        inicio: { type: nodeType, url: 'https://exemplo.com/arquivo', next: null },
      },
    }

    await startFlow({ account: account as never, flow: flows['flow-a'] as never, contact: contact() as never })

    expect(sent.some((s) => s.kind === mediaKind)).toBe(true)
  })

  it('nascido de comentário: manda a legenda e ESPERA a janela abrir para o anexo', async () => {
    // Anexo não cabe em private reply, e comentar não abre a janela de 24h
    // (invariante do CLAUDE.md). Mandar o anexo como DM comum aqui faz a Meta
    // recusar com "outside of allowed window" e o fluxo inteiro morre — era o
    // que este teste garantia antes, codificando o bug.
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: {
        inicio: {
          type: nodeType,
          url: 'https://exemplo.com/arquivo',
          caption: 'Segue o material',
          next: null,
        },
      },
    }

    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      contact: contact({ last_inbound_at: null }) as never,
      commentId: 'comment-1',
    })

    expect(sent.some((s) => s.kind === 'private_reply' && s.text === 'Segue o material')).toBe(true)
    // O anexo NÃO sai agora: sairia fora da janela e derrubaria o fluxo.
    expect(sent.some((s) => s.kind === mediaKind)).toBe(false)
    // E o run fica parado no próprio nó, esperando a pessoa responder.
    // O mock só guarda os updates de `flow_runs`; o último é o do halt.
    const parada = runUpdates.find((u) => u.status === 'waiting_reply')
    expect(parada).toBeDefined()
    expect(parada?.current_node).toBe('inicio')
  })

  it('nascido de comentário com a janela já aberta: manda legenda e anexo', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: {
        inicio: {
          type: nodeType,
          url: 'https://exemplo.com/arquivo',
          caption: 'Segue o material',
          next: null,
        },
      },
    }

    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      // Já mandou DM antes: a janela está aberta, o anexo passa.
      contact: contact() as never,
      commentId: 'comment-1',
    })

    expect(sent.some((s) => s.kind === 'private_reply' && s.text === 'Segue o material')).toBe(true)
    expect(sent.some((s) => s.kind === mediaKind)).toBe(true)
    // Legenda uma vez só: a marca em `vars` impede o caminho de saída repetir.
    // (O mock registra a mesma entrega em mais de uma linha, por isso conta-se
    // só a private reply, que é o canal por onde a legenda saiu.)
    expect(
      sent.filter((s) => s.kind === 'private_reply' && s.text === 'Segue o material'),
    ).toHaveLength(1)
  })

  it('recusa enviar fora da janela de 24h sem ser origem de comentário', async () => {
    flows['flow-a'].definition = {
      entry: 'inicio',
      nodes: {
        inicio: { type: nodeType, url: 'https://exemplo.com/arquivo', next: null },
      },
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

describe('condição "segue a conta"', () => {
  /** Fluxo de presente: entrega só para quem segue, e ensina quem não segue. */
  const definition = {
    entry: 'checa',
    nodes: {
      checa: {
        type: 'condition',
        cases: [
          { source: 'follows', op: 'equals', value: 'sim', next: 'entrega' },
          { source: 'follows', op: 'equals', value: 'nao', next: 'pede_follow' },
        ],
        fallback: 'nao_sei',
      },
      entrega: { type: 'message', text: 'Toma o presente', next: null },
      pede_follow: { type: 'message', text: 'Me segue que eu libero', next: null },
      nao_sei: { type: 'message', text: 'Me manda oi que eu confiro', next: null },
    },
  }

  beforeEach(() => {
    flows['flow-a'].definition = definition as never
  })

  it('entrega para quem segue', async () => {
    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      contact: contact({ follows_account: true }) as never,
    })

    expect(sent.some((s) => s.text === 'Toma o presente')).toBe(true)
  })

  it('pede o follow de quem não segue, em vez de calar', async () => {
    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      contact: contact({ follows_account: false }) as never,
    })

    expect(sent.some((s) => s.text === 'Me segue que eu libero')).toBe(true)
    expect(sent.some((s) => s.text === 'Toma o presente')).toBe(false)
  })

  it('desconhecido NÃO conta como "não segue"', async () => {
    // Quem só comentou tem o campo nulo: comentar não dá consentimento de
    // perfil. Tratar nulo como falso barraria gente que segue de verdade — o
    // lead já pediu o material e sairia sem nada.
    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      contact: contact({ follows_account: null }) as never,
    })

    expect(sent.some((s) => s.text === 'Me manda oi que eu confiro')).toBe(true)
    expect(sent.some((s) => s.text === 'Me segue que eu libero')).toBe(false)
  })
})

describe('reconferir o follow no portão', () => {
  /** O padrão do ManyChat: quem não segue recebe um botão que VOLTA à condição. */
  const definition = {
    entry: 'checa',
    nodes: {
      checa: {
        type: 'condition',
        cases: [{ source: 'follows', op: 'equals', value: 'sim', next: 'entrega' }],
        fallback: 'pede_follow',
      },
      entrega: { type: 'message', text: 'Toma o presente', next: null },
      pede_follow: { type: 'message', text: 'Me segue e clica aqui', next: null },
    },
  }

  beforeEach(() => {
    flows['flow-a'].definition = definition as never
  })

  it('quem seguiu agora recebe, mesmo com o cache dizendo que não seguia', async () => {
    // É ISTO que faz o laço do ManyChat terminar. Sem a reconferência, a
    // pessoa segue, aperta "já estou seguindo", e a condição relê o cache de
    // 24h — que ainda diz "não segue". A ferramenta acusaria de não seguir
    // justamente quem acabou de seguir, para sempre.
    profileResponse = { is_user_follow_business: true }

    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      contact: contact({
        follows_account: false,
        follows_checked_at: new Date(Date.now() - 60_000).toISOString(),
      }) as never,
    })

    expect(sent.some((s) => s.text === 'Toma o presente')).toBe(true)
  })

  it('não gasta chamada com quem já consta como seguidor', async () => {
    profileResponse = { is_user_follow_business: true }
    profileCalls = 0

    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      contact: contact({ follows_account: true }) as never,
    })

    expect(profileCalls).toBe(0)
    expect(sent.some((s) => s.text === 'Toma o presente')).toBe(true)
  })

  it('perfil indisponível não vira "não segue"', async () => {
    // Quem só comentou não dá consentimento: a Meta não responde. Continua
    // sendo "não dá para saber", e o fluxo manda para o senão em vez de
    // afirmar algo falso.
    profileResponse = null

    await startFlow({
      account: account as never,
      flow: flows['flow-a'] as never,
      contact: contact({ follows_account: null }) as never,
    })

    expect(sent.some((s) => s.text === 'Me segue e clica aqui')).toBe(true)
  })
})
