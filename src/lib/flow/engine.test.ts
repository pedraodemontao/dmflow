import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Teste de fumaça do caminho mais intrincado do engine: o bloco `ask`.
 * Ele fica parado em si mesmo enquanto espera, e quem valida a resposta é o
 * resumeFlow. Se essa dança quebrar, o lead entra num loop de repergunta ou
 * o fluxo pula a coleta em silêncio — nos dois casos, sem erro visível.
 *
 * Supabase e Instagram são simulados: o objetivo é a lógica de decisão,
 * não a rede.
 */

const sent: Array<{ kind: string; text: string }> = []
const updates: Array<Record<string, unknown>> = []

let flowDefinition: Record<string, unknown>
let runRow: Record<string, unknown>
let contactRow: Record<string, unknown>

/** Encadeamento mínimo do PostgREST usado pelo engine. */
function fakeQuery(table: string) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder

  builder.select = chain
  builder.eq = chain
  builder.in = chain
  builder.gte = chain
  builder.order = chain
  builder.limit = chain

  builder.insert = (payload: unknown) => {
    if (table === 'messages') {
      const row = payload as { text?: string }
      sent.push({ kind: 'message-row', text: row.text ?? '' })
    }
    return { ...builder, select: chain, single: async () => ({ data: { id: 'run-1' } }) }
  }

  builder.update = (payload: Record<string, unknown>) => {
    if (table === 'flow_runs') updates.push(payload)
    if (table === 'contacts') Object.assign(contactRow, payload)
    return builder
  }

  builder.maybeSingle = async () => ({ data: table === 'flows' ? flowRow() : null })
  builder.single = async () => ({ data: table === 'flows' ? flowRow() : null })
  builder.then = (resolve: (value: { data: unknown; count: number }) => unknown) =>
    resolve({ data: [], count: 0 })

  return builder
}

const flowRow = () => ({ id: 'flow-1', name: 'teste', definition: flowDefinition, is_active: true })

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

const { resumeFlow } = await import('@/lib/flow/engine')

const account = { id: 'acc-1', ig_user_id: 'ig-1', access_token: 't' }

function contact() {
  return {
    id: 'contact-1',
    ig_user_id: 'lead-1',
    username: 'lead',
    name: 'Lead',
    tags: [],
    fields: {},
    subscribed: true,
    // Janela de 24h aberta, senão o envio é recusado antes da lógica do ask.
    last_inbound_at: new Date().toISOString(),
  }
}

function run(context: Record<string, unknown>) {
  return {
    id: 'run-1',
    account_id: 'acc-1',
    flow_id: 'flow-1',
    contact_id: 'contact-1',
    current_node: 'pergunta',
    status: 'waiting_reply',
    resume_at: null,
    context,
    error: null,
  }
}

beforeEach(() => {
  sent.length = 0
  updates.length = 0
  contactRow = contact()
  runRow = run({})
  flowDefinition = {
    entry: 'pergunta',
    nodes: {
      pergunta: {
        type: 'ask',
        text: 'Qual seu e-mail?',
        saveAs: 'email',
        expect: 'email',
        maxRetries: 1,
        next: 'obrigado',
      },
      obrigado: { type: 'message', text: 'Valeu!', next: null },
    },
  }
})

describe('bloco ask', () => {
  it('resposta válida: guarda normalizado e segue para o próximo bloco', async () => {
    await resumeFlow({
      run: run({ vars: {}, awaitingAsk: { nodeId: 'pergunta', retries: 0 } }) as never,
      account: account as never,
      contact: contactRow as never,
      input: 'PEDRO@Gmail.COM',
    })

    expect(sent.filter((s) => s.kind === 'dm').map((s) => s.text)).toEqual(['Valeu!'])

    const final = updates.at(-1) as { context?: { vars?: Record<string, string> } }
    expect(final.context?.vars?.email).toBe('pedro@gmail.com')
    expect(final.context).not.toHaveProperty('awaitingAsk')
  })

  it('resposta inválida com tentativa sobrando: repergunta e continua parado', async () => {
    await resumeFlow({
      run: run({ vars: {}, awaitingAsk: { nodeId: 'pergunta', retries: 0 } }) as never,
      account: account as never,
      contact: contactRow as never,
      input: 'não quero dar',
    })

    // Repergunta saiu, e o fluxo NÃO avançou para "obrigado".
    const texts = sent.filter((s) => s.kind === 'dm').map((s) => s.text)
    expect(texts).toHaveLength(1)
    expect(texts[0]).not.toBe('Valeu!')

    const final = updates.at(-1) as { context?: { awaitingAsk?: { retries: number } } }
    expect(final.context?.awaitingAsk?.retries).toBe(1)
  })

  it('tentativas esgotadas: segue mesmo assim, para não prender o lead', async () => {
    await resumeFlow({
      run: run({ vars: {}, awaitingAsk: { nodeId: 'pergunta', retries: 1 } }) as never,
      account: account as never,
      contact: contactRow as never,
      input: 'não quero dar',
    })

    expect(sent.filter((s) => s.kind === 'dm').map((s) => s.text)).toEqual(['Valeu!'])

    const final = updates.at(-1) as { context?: { vars?: Record<string, string> } }
    expect(final.context?.vars?.email).toBe('não quero dar')
  })

  it('usa a mensagem de repergunta configurada quando existe', async () => {
    ;(flowDefinition.nodes as Record<string, Record<string, unknown>>).pergunta.retryText =
      'Confere esse e-mail aí 🙏'

    await resumeFlow({
      run: run({ vars: {}, awaitingAsk: { nodeId: 'pergunta', retries: 0 } }) as never,
      account: account as never,
      contact: contactRow as never,
      input: 'invalido',
    })

    expect(sent.some((s) => s.text === 'Confere esse e-mail aí 🙏')).toBe(true)
  })
})

describe('wait_reply continua funcionando', () => {
  it('guarda a resposta crua, sem validar', async () => {
    flowDefinition = {
      entry: 'espera',
      nodes: {
        espera: { type: 'wait_reply', saveAs: 'resposta', next: 'fim' },
        fim: { type: 'message', text: 'ok', next: null },
      },
    }
    runRow = { ...run({ vars: {} }), current_node: 'fim' }

    await resumeFlow({
      run: runRow as never,
      account: account as never,
      contact: contactRow as never,
      input: 'qualquer coisa',
    })

    const final = updates.at(-1) as { context?: { vars?: Record<string, string> } }
    expect(final.context?.vars?.resposta).toBe('qualquer coisa')
  })
})
