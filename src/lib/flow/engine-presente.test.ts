import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A variável `{{presente}}` (card 01, Fase 4): a URL da entrega vinculada ao
 * fluxo, com o token do contato. O que mais importa provar aqui é a ORDEM —
 * interpolação ANTES do spin, invariante do CLAUDE.md — porque é ela que faz
 * `{Toma o link {{presente}}|Segue o link {{presente}}}` funcionar. Se a
 * ordem inverter, o spin sorteia em cima de `{{presente}}` ainda cru e ou
 * quebra o grupo de spintax, ou manda a chave literal para o contato.
 *
 * Supabase e Instagram são simulados, como em `engine-blocks.test.ts`.
 */

const FLOW_ID = '11111111-1111-4111-8111-111111111111'
const DELIVERY_ID = '99999999-9999-4999-8999-999999999999'
const DELIVERY_SLUG = 'mapa-do-conteudo-7fk2qa'

const sent: Array<{ kind: string; text: string }> = []

let flow: { id: string; account_id: string; name: string; definition: unknown; delivery_id: string | null }

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
    const afterInsert: Record<string, unknown> = {
      ...builder,
      single: async () => ({ data: { id: 'run-1' } }),
    }
    afterInsert.select = () => afterInsert
    return afterInsert
  }

  builder.update = chain

  builder.maybeSingle = async () => {
    if (table === 'flows') return { data: filters.id === flow.id ? flow : null }
    if (table === 'deliveries') {
      return { data: filters.id === DELIVERY_ID ? { slug: DELIVERY_SLUG } : null }
    }
    // flow_runs: nunca há um run "ativo" ou "morto" concorrente nestes testes.
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
  flow = {
    id: FLOW_ID,
    account_id: 'acc-1',
    name: 'fluxo com entrega',
    delivery_id: DELIVERY_ID,
    definition: {
      entry: 'inicio',
      nodes: {
        inicio: {
          type: 'message',
          text: '{Toma o link {{presente}}|Segue o link {{presente}}}',
          next: null,
        },
      },
    },
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('{{presente}}', () => {
  it('interpola a URL completa ANTES do spin — nenhuma chave sobra no texto enviado', async () => {
    vi.stubEnv('APP_URL', 'https://dm.nocodepedro.site')
    vi.stubEnv('DELIVERY_TOKEN_SECRET', 'segredo-de-teste-bem-comprido')

    await startFlow({ account: account as never, flow: flow as never, contact: contact() as never })

    const enviada = sent.find((s) => s.kind === 'dm')
    expect(enviada?.text).toMatch(
      /^(Toma o link|Segue o link) https:\/\/dm\.nocodepedro\.site\/e\/mapa-do-conteudo-7fk2qa\?c=[\w-]+\.[0-9a-f]+$/,
    )
  })

  it('o mesmo token sai em toda mensagem do run — o link não muda no meio da conversa', async () => {
    vi.stubEnv('APP_URL', 'https://dm.nocodepedro.site')
    vi.stubEnv('DELIVERY_TOKEN_SECRET', 'segredo-de-teste-bem-comprido')
    flow.definition = {
      entry: 'um',
      nodes: {
        um: { type: 'message', text: 'Primeiro: {{presente}}', next: 'dois' },
        dois: { type: 'message', text: 'Segundo: {{presente}}', next: null },
      },
    }

    await startFlow({ account: account as never, flow: flow as never, contact: contact() as never })

    const [primeira, segunda] = sent.filter((s) => s.kind === 'dm')
    const token = (texto: string) => texto.split('?c=')[1]

    expect(token(primeira.text)).toBe(token(segunda.text))
  })

  it('sem APP_URL/DELIVERY_TOKEN_SECRET configurados, vira string vazia em vez de quebrar o fluxo', async () => {
    await startFlow({ account: account as never, flow: flow as never, contact: contact() as never })

    const enviada = sent.find((s) => s.kind === 'dm')
    expect(enviada?.text).toMatch(/^(Toma o link|Segue o link)\s*$/)
  })

  it('sem entrega vinculada (delivery_id nulo), vira string vazia', async () => {
    vi.stubEnv('APP_URL', 'https://dm.nocodepedro.site')
    vi.stubEnv('DELIVERY_TOKEN_SECRET', 'segredo-de-teste-bem-comprido')
    flow.delivery_id = null

    await startFlow({ account: account as never, flow: flow as never, contact: contact() as never })

    const enviada = sent.find((s) => s.kind === 'dm')
    expect(enviada?.text).toMatch(/^(Toma o link|Segue o link)\s*$/)
  })
})
