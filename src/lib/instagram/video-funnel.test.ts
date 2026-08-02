import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `computeFunnelDrops` é o cálculo do funil do card 02 (bloco 2): o degrau
 * que mais perde é a resposta para "o que consertar". `getVideoFunnel` é a
 * orquestração — "abriram o presente" só aparece com entrega configurada,
 * senão 0 pareceria "ninguém abriu" em vez de "não existe presente aqui".
 */

let webhookRows: Array<Record<string, unknown>>
let flowRunRows: Array<Record<string, unknown>>
let buttonClickRows: Array<Record<string, unknown>>
let deliveryViewRows: Array<Record<string, unknown>>
let followersCount: number

function fakeQuery(table: string) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder

  builder.select = chain
  builder.eq = chain
  builder.limit = chain
  builder.order = chain
  builder.maybeSingle = async () => ({ data: null, error: null })

  builder.then = (resolve: (value: unknown) => unknown) => {
    if (table === 'webhook_events') return Promise.resolve({ data: webhookRows, error: null }).then(resolve)
    if (table === 'flow_runs') return Promise.resolve({ data: flowRunRows, error: null }).then(resolve)
    if (table === 'button_clicks') return Promise.resolve({ data: buttonClickRows, error: null }).then(resolve)
    if (table === 'delivery_views') return Promise.resolve({ data: deliveryViewRows, error: null }).then(resolve)
    if (table === 'contacts') return Promise.resolve({ count: followersCount, error: null }).then(resolve)
    return Promise.resolve({ data: [], error: null }).then(resolve)
  }

  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

const { computeFunnelDrops, getVideoFunnel } = await import('./video-funnel')

beforeEach(() => {
  webhookRows = []
  flowRunRows = []
  buttonClickRows = []
  deliveryViewRows = []
  followersCount = 0
})

describe('computeFunnelDrops', () => {
  it('primeiro degrau nunca tem queda', () => {
    const [first] = computeFunnelDrops([{ key: 'a', label: 'a', value: 100 }])
    expect(first.dropPct).toBeNull()
  })

  it('calcula a queda em % contra o degrau anterior', () => {
    const steps = computeFunnelDrops([
      { key: 'viram', label: 'viram', value: 1000 },
      { key: 'comentaram', label: 'comentaram', value: 300 },
      { key: 'viraram_dm', label: 'viraram DM', value: 298 },
    ])

    expect(steps[1].dropPct).toBe(70) // 1 - 300/1000 = 70%
    expect(steps[2].dropPct).toBe(1) // 1 - 298/300 ≈ 1%
  })

  it('degrau anterior em zero não divide — dropPct fica null, não Infinity', () => {
    const steps = computeFunnelDrops([
      { key: 'viram', label: 'viram', value: 0 },
      { key: 'comentaram', label: 'comentaram', value: 5 },
    ])

    expect(steps[1].dropPct).toBeNull()
  })

  it('degrau que cresce em relação ao anterior vira queda negativa (ganho)', () => {
    const steps = computeFunnelDrops([
      { key: 'a', label: 'a', value: 10 },
      { key: 'b', label: 'b', value: 20 },
    ])

    expect(steps[1].dropPct).toBe(-100)
  })
})

describe('getVideoFunnel', () => {
  it('sem entrega configurada, não inclui o degrau "abriram o presente"', async () => {
    const steps = await getVideoFunnel({ flowId: 'f1', mediaId: 'm1', deliveryId: null, views: 100 })
    expect(steps.some((s) => s.key === 'abriram_presente')).toBe(false)
  })

  it('com entrega configurada, inclui o degrau e conta visitantes distintos', async () => {
    deliveryViewRows = [{ contact_id: 'c1' }, { contact_id: 'c1' }, { contact_id: 'c2' }, { contact_id: null }]

    const steps = await getVideoFunnel({ flowId: 'f1', mediaId: 'm1', deliveryId: 'd1', views: 100 })
    const abriram = steps.find((s) => s.key === 'abriram_presente')

    expect(abriram?.value).toBe(2) // c1 duas vezes conta uma, null não conta
  })

  it('comentaram conta pessoa distinta, não linha de webhook_events', async () => {
    webhookRows = [{ from_id: 'lead-1' }, { from_id: 'lead-1' }, { from_id: 'lead-2' }]

    const steps = await getVideoFunnel({ flowId: 'f1', mediaId: 'm1', deliveryId: null, views: 100 })
    expect(steps.find((s) => s.key === 'comentaram')?.value).toBe(2)
  })

  it('viraram DM e clicaram contam contato distinto, não linha', async () => {
    flowRunRows = [{ contact_id: 'c1' }, { contact_id: 'c1' }]
    buttonClickRows = [{ contact_id: 'c1' }, { contact_id: 'c2' }]

    const steps = await getVideoFunnel({ flowId: 'f1', mediaId: 'm1', deliveryId: null, views: 100 })
    expect(steps.find((s) => s.key === 'viraram_dm')?.value).toBe(1)
    expect(steps.find((s) => s.key === 'clicaram')?.value).toBe(2)
  })
})
