import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `handleMessaging` decide se um evento de messaging vira DM comum, resposta
 * de story ou menção em story, e roteia para o gatilho certo.
 *
 * `story_reply` existe desde o começo mas nunca foi testado ponta a ponta
 * (ROADMAP). `story_mention` é código novo: só vai disparar de verdade
 * quando o webhook (nunca entregou nada, ver HANDOFF.md) ou o polling
 * passarem a entregar o campo `attachments` — aqui testamos só a lógica de
 * decisão em si, sem rede.
 *
 * Supabase, Instagram e o engine são simulados — o objetivo é a lógica de
 * roteamento, não a rede (mesmo espírito de engine.test.ts).
 */

const insertedMessages: Array<Record<string, unknown>> = []
const insertedClicks: Array<Record<string, unknown>> = []
const startFlowCalls: Array<Record<string, unknown>> = []
const resumeFlowCalls: Array<Record<string, unknown>> = []
const findTriggerCalls: Array<{ accountId: string; type: string; text: string }> = []

/** Definições que a varredura de payload enxerga. Vazio = nenhum botão casa. */
let accountFlows: Array<{ id: string; definition: unknown }> = []
/** Liga o erro do PostgREST para simular a tabela `button_clicks` inexistente. */
let clickInsertError: { message: string } | null = null

let contactRow: Record<string, unknown> | null
let waitingRun: Record<string, unknown> | null
let triggerToReturn: Record<string, unknown> | null
let flowToReturn: Record<string, unknown> | null

/** Encadeamento mínimo do PostgREST usado por upsertContact/handleMessaging. */
function fakeQuery(table: string) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder

  builder.select = chain
  builder.eq = chain
  builder.order = chain
  builder.limit = chain

  builder.maybeSingle = async () => {
    if (table === 'contacts') return { data: contactRow }
    if (table === 'flow_runs') return { data: waitingRun }
    if (table === 'flows') return { data: flowToReturn }
    return { data: null }
  }

  builder.single = async () => ({ data: contactRow })

  builder.update = (patch: Record<string, unknown>) => {
    if (table === 'contacts' && contactRow) Object.assign(contactRow, patch)
    return builder
  }

  builder.insert = (payload: Record<string, unknown>) => {
    if (table === 'contacts') contactRow = { id: 'contact-new', automation_paused: false, ...payload }
    if (table === 'button_clicks') insertedClicks.push(payload)
    return builder
  }

  builder.upsert = async (payload: Record<string, unknown>) => {
    if (table === 'messages') insertedMessages.push(payload)
    return { data: null, error: null }
  }

  // A varredura de payload e o insert do clique consomem a query direto, sem
  // maybeSingle/single no fim — daí o builder também ser "thenable".
  builder.then = (resolve: (value: unknown) => unknown) => {
    if (table === 'flows') return Promise.resolve({ data: accountFlows, error: null }).then(resolve)
    if (table === 'button_clicks')
      return Promise.resolve({ data: null, error: clickInsertError }).then(resolve)
    return Promise.resolve({ data: null, error: null }).then(resolve)
  }

  return builder
}

/** Deixa o registro de clique (disparado sem await) terminar antes da asserção. */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

/** O que a Meta devolve no perfil do contato. Nulo = perfil indisponível. */
let profileToReturn: { username?: string; name?: string } | null = null

vi.mock('@/lib/instagram/api', () => ({
  fetchContactProfile: async () => profileToReturn,
}))

vi.mock('@/lib/flow/engine', () => ({
  startFlow: async (args: Record<string, unknown>) => {
    startFlowCalls.push(args)
  },
  resumeFlow: async (args: Record<string, unknown>) => {
    resumeFlowCalls.push(args)
  },
}))

vi.mock('@/lib/flow/triggers', () => ({
  findTrigger: async (args: { accountId: string; type: string; text: string }) => {
    findTriggerCalls.push(args)
    return triggerToReturn
  },
}))

const { handleMessaging, detectMessagingTriggerType, retryDelayMs } = await import(
  '@/lib/webhook/process',
)

const account = { id: 'acc-1', ig_user_id: 'ig-1', access_token: 't' }

beforeEach(() => {
  insertedMessages.length = 0
  insertedClicks.length = 0
  startFlowCalls.length = 0
  resumeFlowCalls.length = 0
  findTriggerCalls.length = 0
  accountFlows = []
  clickInsertError = null
  profileToReturn = null

  contactRow = {
    id: 'contact-1',
    account_id: 'acc-1',
    ig_user_id: 'lead-1',
    username: 'lead',
    automation_paused: false,
    source_type: null,
  }
  waitingRun = null
  triggerToReturn = { id: 'trigger-1', flow_id: 'flow-1' }
  flowToReturn = { id: 'flow-1', name: 'fluxo', is_active: true, definition: {} }
})

describe('detectMessagingTriggerType', () => {
  it('DM comum -> keyword', () => {
    expect(detectMessagingTriggerType({ message: { text: 'oi' } })).toBe('keyword')
  })

  it('reply_to.story -> story_reply', () => {
    expect(
      detectMessagingTriggerType({
        message: { text: 'adorei!', reply_to: { story: { id: 's1' } } },
      }),
    ).toBe('story_reply')
  })

  it('anexo story_mention -> story_mention, mesmo sem texto', () => {
    expect(
      detectMessagingTriggerType({
        message: { attachments: [{ type: 'story_mention', payload: { url: 'https://x' } }] },
      }),
    ).toBe('story_mention')
  })

  it('anexo de outro tipo não é tratado como menção', () => {
    expect(detectMessagingTriggerType({ message: { attachments: [{ type: 'image' }] } })).toBe(
      'keyword',
    )
  })

  it('sem message nem postback -> keyword (comportamento neutro, não quebra)', () => {
    expect(detectMessagingTriggerType({})).toBe('keyword')
  })
})

describe('handleMessaging', () => {
  it('ignora echo: não registra mensagem nem consulta gatilho', async () => {
    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { text: 'oi', is_echo: true },
    })

    expect(insertedMessages).toHaveLength(0)
    expect(findTriggerCalls).toHaveLength(0)
  })

  it('ignora mensagem da própria conta (evita loop)', async () => {
    await handleMessaging(account as never, {
      sender: { id: 'ig-1' },
      message: { text: 'oi' },
    })

    expect(insertedMessages).toHaveLength(0)
  })

  it('DM com palavra-chave: casa gatilho keyword e dispara o fluxo', async () => {
    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm1', text: 'quero' },
    })

    expect(insertedMessages).toHaveLength(1)
    expect(findTriggerCalls).toEqual([{ accountId: 'acc-1', type: 'keyword', text: 'quero' }])
    expect(startFlowCalls).toHaveLength(1)
  })

  it('resposta de story: casa gatilho story_reply, não keyword', async () => {
    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: {
        mid: 'm2',
        text: 'kkkk adorei',
        reply_to: { story: { id: 's1', url: 'https://cdn/x' } },
      },
    })

    expect(findTriggerCalls).toEqual([
      { accountId: 'acc-1', type: 'story_reply', text: 'kkkk adorei' },
    ])
    expect(startFlowCalls).toHaveLength(1)
  })

  it('menção em story: sem texto, mesmo assim registra a mensagem e casa gatilho story_mention', async () => {
    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: {
        mid: 'm3',
        attachments: [{ type: 'story_mention', payload: { url: 'https://cdn/x' } }],
      },
    })

    expect(insertedMessages).toHaveLength(1)
    expect(findTriggerCalls).toEqual([{ accountId: 'acc-1', type: 'story_mention', text: '' }])
    expect(startFlowCalls).toHaveLength(1)
  })

  it('mensagem sem texto e sem menção (ex.: figurinha) não casa gatilho nenhum', async () => {
    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm4' },
    })

    expect(insertedMessages).toHaveLength(1)
    expect(findTriggerCalls).toHaveLength(0)
    expect(startFlowCalls).toHaveLength(0)
  })

  it('contato em atendimento humano: registra a mensagem mas não roda gatilho nenhum', async () => {
    contactRow!.automation_paused = true

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm5', text: 'oi' },
    })

    expect(insertedMessages).toHaveLength(1)
    expect(findTriggerCalls).toHaveLength(0)
  })

  it('fluxo esperando resposta: texto retoma o wait_reply em vez de casar gatilho novo', async () => {
    waitingRun = { id: 'run-1', status: 'waiting_reply', contact_id: 'contact-1' }

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm6', text: 'sim' },
    })

    expect(resumeFlowCalls).toHaveLength(1)
    expect(findTriggerCalls).toHaveLength(0)
    expect(startFlowCalls).toHaveLength(0)
  })

  it('menção em story NÃO retoma um wait_reply pendente — é gatilho de entrada, não resposta', async () => {
    waitingRun = { id: 'run-1', status: 'waiting_reply', contact_id: 'contact-1' }

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm7', attachments: [{ type: 'story_mention' }] },
    })

    expect(resumeFlowCalls).toHaveLength(0)
    expect(findTriggerCalls).toEqual([{ accountId: 'acc-1', type: 'story_mention', text: '' }])
  })

  it('ice breaker: o payload do postback vira o texto casado contra o gatilho keyword', async () => {
    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      postback: { mid: 'p1', title: 'Quanto custa?', payload: 'QUANTO_CUSTA' },
    })

    expect(findTriggerCalls).toEqual([
      { accountId: 'acc-1', type: 'keyword', text: 'QUANTO_CUSTA' },
    ])
    expect(startFlowCalls).toHaveLength(1)
  })

  it('nenhum gatilho casa: não dispara fluxo', async () => {
    triggerToReturn = null

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm8', text: 'qualquer coisa' },
    })

    expect(startFlowCalls).toHaveLength(0)
  })

  it('gatilho casa mas o fluxo está inativo: não dispara', async () => {
    flowToReturn!.is_active = false

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm9', text: 'oi' },
    })

    expect(startFlowCalls).toHaveLength(0)
  })
})

describe('nome do contato quando a conta é renomeada', () => {
  /**
   * O contato é casado por `ig_user_id`, que não muda quando a pessoa troca o
   * @ do Instagram. Enquanto o handle só era gravado se estivesse VAZIO, o
   * guardado envelhecia para sempre: em 25/08/2026 @portal_prosperidade.pt
   * comentou e recebeu "Fala dra.minaseo!", o nome dela em julho.
   *
   * O caminho do comentário (`handleComment`, que recebe `from.username` cru)
   * segue exatamente a mesma regra, no mesmo `upsertContact`.
   */
  it('atualiza o handle e o nome quando a Meta devolve outros', async () => {
    contactRow = {
      id: 'contact-1',
      account_id: 'acc-1',
      ig_user_id: 'lead-1',
      username: 'nome_antigo',
      name: 'Nome Antigo',
      automation_paused: false,
      source_type: null,
      profile_synced_at: null,
    }
    profileToReturn = { username: 'nome_novo', name: 'Nome Novo' }

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm1', text: 'oi' },
    })

    expect(contactRow.username).toBe('nome_novo')
    expect(contactRow.name).toBe('Nome Novo')
  })

  it('não apaga o que já existe quando a Meta não devolve nada', async () => {
    contactRow = {
      id: 'contact-1',
      account_id: 'acc-1',
      ig_user_id: 'lead-1',
      username: 'continua',
      name: 'Continua',
      automation_paused: false,
      source_type: null,
      profile_synced_at: null,
    }
    profileToReturn = null

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm1', text: 'oi' },
    })

    expect(contactRow.username).toBe('continua')
    expect(contactRow.name).toBe('Continua')
  })
})

describe('registro do clique em botão', () => {
  const flowComBotoes = {
    id: 'flow-1',
    definition: {
      entry: 'oferta',
      nodes: {
        oferta: {
          type: 'buttons',
          text: 'Quer o mapa?',
          buttons: [
            { title: 'Quero o mapa', payload: 'QUERO_MAPA' },
            { title: 'Depois eu vejo', payload: 'DEPOIS' },
          ],
        },
      },
    },
  }

  it('postback: grava payload, origem resolvida e o rótulo da definição', async () => {
    accountFlows = [flowComBotoes]

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      postback: { mid: 'p1', title: 'Quero o mapa', payload: 'QUERO_MAPA' },
    })
    await flush()

    expect(insertedClicks).toEqual([
      {
        account_id: 'acc-1',
        contact_id: 'contact-1',
        flow_id: 'flow-1',
        node_id: 'oferta',
        payload: 'QUERO_MAPA',
        title: 'Quero o mapa',
      },
    ])
  })

  it('quick reply também conta como clique', async () => {
    accountFlows = [
      {
        id: 'flow-2',
        definition: {
          entry: 'p',
          nodes: {
            p: {
              type: 'message',
              text: 'Prefere qual?',
              quickReplies: [{ title: 'Manhã', payload: 'TURNO_MANHA' }],
            },
          },
        },
      },
    ]

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'q1', quick_reply: { payload: 'TURNO_MANHA' } },
    })
    await flush()

    expect(insertedClicks).toHaveLength(1)
    expect(insertedClicks[0]).toMatchObject({ node_id: 'p', title: 'Manhã' })
  })

  it('payload órfão: grava mesmo assim, com origem nula e o título que a Meta mandou', async () => {
    accountFlows = [flowComBotoes]

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      postback: { mid: 'p2', title: 'Quanto custa?', payload: 'ICE_BREAKER' },
    })
    await flush()

    expect(insertedClicks[0]).toMatchObject({
      flow_id: null,
      node_id: null,
      payload: 'ICE_BREAKER',
      title: 'Quanto custa?',
    })
  })

  it('mensagem de texto comum não gera clique', async () => {
    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      message: { mid: 'm10', text: 'oi' },
    })
    await flush()

    expect(insertedClicks).toHaveLength(0)
  })

  it('contato em atendimento humano: o clique é registrado mesmo sem automação rodar', async () => {
    accountFlows = [flowComBotoes]
    contactRow!.automation_paused = true

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      postback: { mid: 'p3', title: 'Quero o mapa', payload: 'QUERO_MAPA' },
    })
    await flush()

    expect(insertedClicks).toHaveLength(1)
    expect(startFlowCalls).toHaveLength(0)
  })

  it('tabela ainda não criada: o erro vira log e a entrega segue normalmente', async () => {
    accountFlows = [flowComBotoes]
    clickInsertError = { message: 'relation "button_clicks" does not exist' }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await handleMessaging(account as never, {
      sender: { id: 'lead-1' },
      postback: { mid: 'p4', title: 'Quero o mapa', payload: 'QUERO_MAPA' },
    })
    await flush()

    // O fluxo disparou apesar do erro na métrica.
    expect(startFlowCalls).toHaveLength(1)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('retryDelayMs', () => {
  it('dobra a espera a cada tentativa', () => {
    expect(retryDelayMs(1)).toBe(60_000)
    expect(retryDelayMs(2)).toBe(120_000)
    expect(retryDelayMs(3)).toBe(240_000)
  })

  it('para de dobrar no teto de 6h', () => {
    expect(retryDelayMs(20)).toBe(6 * 60 * 60 * 1000)
  })

  it('cobre mais de 24h com o orçamento de 12 tentativas', () => {
    // A queda de token de 30/07/2026 durou 22h. Com 3 tentativas seguidas o
    // comentário morria nos primeiros minutos; o horizonte tem que passar disso.
    const total = Array.from({ length: 12 }, (_, i) => retryDelayMs(i + 1)).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(24 * 60 * 60 * 1000)
  })

  it('não devolve espera negativa para tentativa zero', () => {
    expect(retryDelayMs(0)).toBe(60_000)
  })
})
