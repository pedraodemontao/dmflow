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
const startFlowCalls: Array<Record<string, unknown>> = []
const resumeFlowCalls: Array<Record<string, unknown>> = []
const findTriggerCalls: Array<{ accountId: string; type: string; text: string }> = []

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
    return builder
  }

  builder.upsert = async (payload: Record<string, unknown>) => {
    if (table === 'messages') insertedMessages.push(payload)
    return { data: null, error: null }
  }

  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

vi.mock('@/lib/instagram/api', () => ({
  fetchContactProfile: async () => null,
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

const { handleMessaging, detectMessagingTriggerType } = await import('@/lib/webhook/process')

const account = { id: 'acc-1', ig_user_id: 'ig-1', access_token: 't' }

beforeEach(() => {
  insertedMessages.length = 0
  startFlowCalls.length = 0
  resumeFlowCalls.length = 0
  findTriggerCalls.length = 0

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
