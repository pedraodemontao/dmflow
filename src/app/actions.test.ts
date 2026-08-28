import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * As duas saídas do card de falhas do cockpit.
 *
 * O que quebra em silêncio aqui: (1) devolver o run para a fila num estado que
 * o cron NÃO varre — o painel diz "voltou" e nada acontece nunca; (2) dispensar
 * com `status = 'done'`, que apagaria a falha da tela inflando o "concluídos"
 * das automações. Os dois testes abaixo travam exatamente isso.
 *
 * Supabase é simulado: um array em memória com o encadeamento do PostgREST que
 * as actions usam (mesmo espírito de engine.test.ts).
 */

const ACCOUNT_ID = 'acc-1'
const OTHER_ACCOUNT_ID = 'acc-2'

type Row = Record<string, unknown>

let flowRuns: Row[] = []
let contacts: Row[] = []
let accountRow: Row | null = null
let sent: Row[] = []

function rowsOf(table: string): Row[] {
  if (table === 'flow_runs') return flowRuns
  if (table === 'contacts') return contacts
  return []
}

/** Encadeamento mínimo do PostgREST usado pelas actions de disparo falhado. */
function fakeQuery(table: string) {
  const eqs: Array<[string, unknown]> = []
  const ins: Array<[string, unknown[]]> = []
  let patch: Row | null = null

  const selected = () =>
    rowsOf(table).filter(
      (row) =>
        eqs.every(([column, value]) => row[column] === value) &&
        ins.every(([column, values]) => values.includes(row[column])),
    )

  const settle = () => {
    const rows = selected()
    if (patch) for (const row of rows) Object.assign(row, patch)
    return { data: rows, error: null, count: rows.length }
  }

  const builder: Record<string, unknown> = {}
  const chain = () => builder

  builder.select = chain
  builder.order = chain
  builder.limit = chain
  builder.or = chain

  builder.eq = (column: string, value: unknown) => {
    eqs.push([column, value])
    return builder
  }

  builder.in = (column: string, values: unknown[]) => {
    ins.push([column, values])
    return builder
  }

  builder.update = (next: Row) => {
    patch = next
    return builder
  }

  builder.insert = () => builder

  builder.maybeSingle = async () => {
    const { data } = settle()
    return { data: data[0] ?? null, error: null }
  }

  builder.then = (resolve: (value: unknown) => unknown) => resolve(settle())

  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

vi.mock('@/lib/data', () => ({
  getAccount: async () => accountRow,
  getThread: async () => null,
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

vi.mock('@/lib/instagram/api', () => ({
  sendText: async (args: Row) => {
    sent.push(args)
  },
  setIceBreakers: async () => {},
  clearIceBreakers: async () => {},
}))

vi.mock('@/lib/flow/send-cap', () => ({
  assertUnderSendCap: async () => {},
  logSend: async () => {},
}))

const {
  dismissAllFailedRuns,
  dismissFailedRun,
  retryAllFailedRuns,
  retryFailedRun,
  sendManualMessage,
} = await import('@/app/actions')

const { DISMISSED_ERROR_PREFIX } = await import('@/lib/flow/dismissed')

const RUN_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_RUN_ID = '22222222-2222-4222-8222-222222222222'

function failedRun(overrides: Row = {}): Row {
  return {
    id: RUN_ID,
    account_id: ACCOUNT_ID,
    flow_id: 'flow-1',
    contact_id: 'contact-1',
    current_node: 'mensagem',
    status: 'failed',
    resume_at: null,
    error: 'OAuthException code 1',
    updated_at: '2026-07-29T10:00:00.000Z',
    ...overrides,
  }
}

const CONTACT_ID = '33333333-3333-4333-8333-333333333333'

function contactRow(overrides: Row = {}): Row {
  return {
    id: CONTACT_ID,
    account_id: ACCOUNT_ID,
    ig_user_id: 'ig-contact-1',
    last_inbound_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  accountRow = { id: ACCOUNT_ID, ig_user_id: 'ig-1', access_token: 't' }
  flowRuns = [failedRun()]
  contacts = [contactRow()]
  sent = []
})

describe('retryFailedRun', () => {
  it('devolve o run para o estado que o cron realmente varre', async () => {
    const before = Date.now()
    const result = await retryFailedRun(RUN_ID)

    expect(result.ok).toBe(true)

    const run = flowRuns[0]
    // resumeSleepingRuns (api/cron/tick) só procura sleeping com resume_at
    // vencido. 'running' aqui seria um run que ninguém retoma.
    expect(run.status).toBe('sleeping')
    expect(new Date(run.resume_at as string).getTime()).toBeLessThanOrEqual(Date.now())
    expect(new Date(run.resume_at as string).getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(run.error).toBeNull()
    // É de onde o resumeFlow recomeça: perder isto perde o fluxo.
    expect(run.current_node).toBe('mensagem')
  })

  it('run sem bloco atual não volta para a fila (não teria de onde retomar)', async () => {
    flowRuns = [failedRun({ current_node: null })]

    const result = await retryFailedRun(RUN_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('sem bloco atual')
    expect(flowRuns[0].status).toBe('failed')
  })

  it('contato já com fluxo ativo não recebe outro por cima', async () => {
    flowRuns = [
      failedRun(),
      failedRun({ id: OTHER_RUN_ID, status: 'waiting_reply', contact_id: 'contact-1' }),
    ]

    const result = await retryFailedRun(RUN_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('outro fluxo em andamento')
    expect(flowRuns[0].status).toBe('failed')
  })

  it('run de outra conta não é tocado, mesmo com o id certo', async () => {
    flowRuns = [failedRun({ account_id: OTHER_ACCOUNT_ID })]

    const result = await retryFailedRun(RUN_ID)

    expect(result.ok).toBe(false)
    expect(flowRuns[0].status).toBe('failed')
  })

  it('id fora do formato é recusado antes de qualquer leitura', async () => {
    const result = await retryFailedRun('nao-e-uuid')

    expect(result.ok).toBe(false)
    expect(flowRuns[0].status).toBe('failed')
  })

  it('sem conta conectada não faz nada', async () => {
    accountRow = null

    const result = await retryFailedRun(RUN_ID)

    expect(result.ok).toBe(false)
    expect(flowRuns[0].status).toBe('failed')
  })
})

describe('dismissFailedRun', () => {
  it('marca no erro e MANTÉM o status failed', async () => {
    const result = await dismissFailedRun(RUN_ID)

    expect(result.ok).toBe(true)
    // 'done' faria a falha contar como conversão em getAutomations().stats.done.
    expect(flowRuns[0].status).toBe('failed')
    expect(flowRuns[0].error as string).toMatch(new RegExp(`^${DISMISSED_ERROR_PREFIX}`))
  })

  it('guarda o erro original junto da marca', async () => {
    await dismissFailedRun(RUN_ID)

    expect(flowRuns[0].error).toContain('OAuthException code 1')
  })

  it('falha sem texto de erro também é dispensável', async () => {
    flowRuns = [failedRun({ error: null })]

    const result = await dismissFailedRun(RUN_ID)

    expect(result.ok).toBe(true)
    expect(flowRuns[0].error as string).toMatch(new RegExp(`^${DISMISSED_ERROR_PREFIX}`))
  })

  it('dispensar duas vezes não empilha prefixo', async () => {
    await dismissFailedRun(RUN_ID)
    const first = flowRuns[0].error

    const second = await dismissFailedRun(RUN_ID)

    // A segunda nem encontra o run: dispensado já saiu da lista de candidatos.
    expect(second.ok).toBe(false)
    expect(flowRuns[0].error).toBe(first)
  })

  it('run de outra conta não é dispensado', async () => {
    flowRuns = [failedRun({ account_id: OTHER_ACCOUNT_ID })]

    const result = await dismissFailedRun(RUN_ID)

    expect(result.ok).toBe(false)
    expect(flowRuns[0].error).toBe('OAuthException code 1')
  })

  it('id fora do formato é recusado', async () => {
    const result = await dismissFailedRun('123')

    expect(result.ok).toBe(false)
    expect(flowRuns[0].error).toBe('OAuthException code 1')
  })
})

describe('ações em lote', () => {
  it('retryAllFailedRuns devolve o que dá e conta o que pulou', async () => {
    flowRuns = [
      failedRun(),
      failedRun({ id: OTHER_RUN_ID, contact_id: 'contact-2', current_node: null }),
    ]

    const result = await retryAllFailedRuns()

    expect(result.affected).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.ok).toBe(true)
    expect(flowRuns[0].status).toBe('sleeping')
    expect(flowRuns[1].status).toBe('failed')
  })

  it('retryAllFailedRuns não toca em falha de outra conta', async () => {
    flowRuns = [failedRun({ account_id: OTHER_ACCOUNT_ID })]

    const result = await retryAllFailedRuns()

    expect(result.affected).toBe(0)
    expect(flowRuns[0].status).toBe('failed')
  })

  it('dismissAllFailedRuns limpa o card sem mexer em status', async () => {
    flowRuns = [failedRun(), failedRun({ id: OTHER_RUN_ID, contact_id: 'contact-2' })]

    const result = await dismissAllFailedRuns()

    expect(result.ok).toBe(true)
    expect(result.affected).toBe(2)
    for (const run of flowRuns) {
      expect(run.status).toBe('failed')
      expect(run.error as string).toMatch(new RegExp(`^${DISMISSED_ERROR_PREFIX}`))
    }
  })

  it('dismissAllFailedRuns ignora quem já estava dispensado', async () => {
    flowRuns = [failedRun({ error: `${DISMISSED_ERROR_PREFIX} no painel — erro original: x` })]

    const result = await dismissAllFailedRuns()

    expect(result.affected).toBe(0)
  })
})

/**
 * A guarda que separa as contas no inbox.
 *
 * `getAccount()` devolve sempre a conta mais antiga, e as listas do inbox ainda
 * não filtram por conta: com uma segunda conta conectada, a conversa dela
 * aparece na tela e o envio sairia com o token da conta errada. O segundo teste
 * existe para a guarda não passar por "recusa sempre" — sem ele, `return
 * { ok: false }` no topo da função deixaria o primeiro verde.
 */
describe('sendManualMessage com mais de uma conta', () => {
  it('recusa conversa de outra conta em vez de enviar com o token errado', async () => {
    contacts = [contactRow({ account_id: OTHER_ACCOUNT_ID })]

    const result = await sendManualMessage(CONTACT_ID, 'oi')

    expect(result.ok).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('envia normalmente quando o contato é da conta conectada', async () => {
    const result = await sendManualMessage(CONTACT_ID, 'oi')

    expect(result.ok).toBe(true)
    expect(sent).toEqual([
      { igUserId: 'ig-1', accessToken: 't', recipientId: 'ig-contact-1', text: 'oi' },
    ])
  })
})
