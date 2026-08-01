import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `fetchMediaInsights` degrada quando a Meta recusa a chamada inteira por
 * causa de UMA métrica incompatível com o tipo da mídia — confirmado por
 * curl contra a conta real em 01/08/2026 (REELS recusa follows/
 * profile_visits/link_clicks). `shouldCollect` é o espaçamento: 1x/mídia/hora,
 * e 1x/dia quando o post passou de 30 dias e as duas últimas coletas vieram
 * idênticas.
 */

let mediaInsightsRows: Array<Record<string, unknown>>
let triggerRows: Array<Record<string, unknown>>
let insertedRows: Array<Record<string, unknown>>
let insertError: { message: string } | null

function fakeQuery(table: string) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder

  builder.select = chain
  builder.eq = chain
  builder.not = chain
  builder.order = chain
  builder.limit = chain

  builder.insert = async (row: Record<string, unknown>) => {
    if (insertError) return { error: insertError }
    insertedRows.push(row)
    return { error: null }
  }

  builder.then = (resolve: (value: unknown) => unknown) => {
    if (table === 'media_insights') return Promise.resolve({ data: mediaInsightsRows }).then(resolve)
    if (table === 'triggers') return Promise.resolve({ data: triggerRows }).then(resolve)
    return Promise.resolve({ data: [] }).then(resolve)
  }

  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

type FakeResponse = { ok: boolean; body: unknown }

/** Fila de respostas por chave ('insights:<mediaId>' / 'timestamp:<mediaId>'). */
let responses: Record<string, FakeResponse[]>

function setResponse(key: string, ...resps: FakeResponse[]) {
  responses[key] = resps
}

vi.stubGlobal('fetch', async (input: string) => {
  const url = new URL(String(input))
  // pathname é /v23.0/<mediaId>[/insights] — índice 2, não 1.
  const mediaId = url.pathname.split('/')[2]
  const key = url.pathname.endsWith('/insights') ? `insights:${mediaId}` : `timestamp:${mediaId}`

  const queue = responses[key]
  const response = queue && queue.length > 1 ? queue.shift()! : (queue?.[0] ?? { ok: true, body: { data: [] } })
  return { ok: response.ok, json: async () => response.body }
})

const { fetchMediaInsights, shouldCollect, collectMediaInsights } = await import('./insights')

function silence() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

function datum(name: string, value: number) {
  return { name, values: [{ value }] }
}

beforeEach(() => {
  mediaInsightsRows = []
  triggerRows = []
  insertedRows = []
  insertError = null
  responses = {}
  vi.restoreAllMocks()
})

describe('fetchMediaInsights', () => {
  it('mapeia o lote completo quando a Meta aceita tudo', async () => {
    setResponse('insights:m1', {
      ok: true,
      body: {
        data: [
          datum('views', 488),
          datum('reach', 144),
          datum('total_interactions', 6),
          datum('saved', 2),
          datum('shares', 2),
          datum('ig_reels_avg_watch_time', 53736),
          datum('ig_reels_video_view_total_time', 8705351),
          datum('reels_skip_rate', 74.5),
        ],
      },
    })

    const snapshot = await fetchMediaInsights({ mediaId: 'm1', accessToken: 'tok' })

    expect(snapshot.views).toBe(488)
    expect(snapshot.avg_watch_time_ms).toBe(53736)
    expect(snapshot.total_watch_time_ms).toBe(8705351)
    expect(snapshot.skip_rate).toBe(74.5)
  })

  it('métrica omitida pela Meta vira null, nunca zero', async () => {
    setResponse('insights:m1', { ok: true, body: { data: [datum('views', 10)] } })

    const snapshot = await fetchMediaInsights({ mediaId: 'm1', accessToken: 'tok' })

    expect(snapshot.views).toBe(10)
    expect(snapshot.reach).toBeNull()
    expect(snapshot.follows).toBeNull()
  })

  it('degrada quando a Meta recusa o lote citando métrica incompatível com o tipo de mídia', async () => {
    const spy = silence()
    setResponse(
      'insights:m1',
      {
        ok: false,
        body: {
          error: {
            message:
              'The Media Insights API does not support the follows, profile_visits metric for this media product type.',
          },
        },
      },
      { ok: true, body: { data: [datum('views', 488), datum('reach', 144)] } },
    )

    const snapshot = await fetchMediaInsights({ mediaId: 'm1', accessToken: 'tok' })

    expect(snapshot.views).toBe(488)
    expect(snapshot.follows).toBeNull()
    expect(snapshot.profile_visits).toBeNull()
    expect(spy).toHaveBeenCalled()
  })

  it('degrada em MAIS de um estágio quando a Meta cita métricas incompatíveis aos poucos', async () => {
    // Reproduz o comportamento real medido em 01/08/2026: com as 11 juntas a
    // Meta só cita link_clicks; tirando ela, só então cita follows e
    // profile_visits. Um retry único ficaria preso no segundo estágio.
    silence()
    setResponse(
      'insights:m1',
      { ok: false, body: { error: { message: 'The metric link_clicks is not available on this endpoint.' } } },
      {
        ok: false,
        body: {
          error: {
            message:
              'The Media Insights API does not support the follows, profile_visits metric for this media product type.',
          },
        },
      },
      {
        ok: true,
        body: { data: [datum('views', 488), datum('reach', 144), datum('total_interactions', 6)] },
      },
    )

    const snapshot = await fetchMediaInsights({ mediaId: 'm1', accessToken: 'tok' })

    expect(snapshot.views).toBe(488)
    expect(snapshot.link_clicks).toBeNull()
    expect(snapshot.follows).toBeNull()
    expect(snapshot.profile_visits).toBeNull()
  })

  it('erro que não cita nenhuma métrica nossa sobe em vez de virar retry silencioso', async () => {
    setResponse('insights:m1', { ok: false, body: { error: { message: 'Error validating access token' } } })

    await expect(fetchMediaInsights({ mediaId: 'm1', accessToken: 'tok' })).rejects.toThrow(
      /Error validating access token/,
    )
  })
})

describe('shouldCollect', () => {
  const target = { accountId: 'acc-1', mediaId: 'm1', accessToken: 'tok' }
  const hourAgo = () => new Date(Date.now() - 61 * 60 * 1000).toISOString()
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString()
  const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()

  const snap = (captured_at: string, views: number) => ({
    captured_at,
    views,
    reach: null,
    follows: null,
    profile_visits: null,
    total_interactions: null,
    saved: null,
    shares: null,
    link_clicks: null,
    avg_watch_time_ms: null,
    total_watch_time_ms: null,
    skip_rate: null,
  })

  it('nunca coletado: coleta', async () => {
    mediaInsightsRows = []
    expect(await shouldCollect(target)).toBe(true)
  })

  it('coletado há menos de 1h: espera', async () => {
    mediaInsightsRows = [snap(minutesAgo(10), 1)]
    expect(await shouldCollect(target)).toBe(false)
  })

  it('passou de 1h e ainda variando: coleta', async () => {
    mediaInsightsRows = [snap(hourAgo(), 100), snap(hourAgo(), 90)]
    expect(await shouldCollect(target)).toBe(true)
  })

  it('estabilizado mas post jovem: mantém 1x/hora', async () => {
    mediaInsightsRows = [snap(hourAgo(), 100), snap(hourAgo(), 100)]
    setResponse('timestamp:m1', { ok: true, body: { timestamp: daysAgo(5) } })
    expect(await shouldCollect(target)).toBe(true)
  })

  it('estabilizado e post com mais de 30 dias: espaça para 1x/dia', async () => {
    mediaInsightsRows = [snap(hourAgo(), 100), snap(hourAgo(), 100)]
    setResponse('timestamp:m1', { ok: true, body: { timestamp: daysAgo(45) } })
    expect(await shouldCollect(target)).toBe(false)
  })

  it('post velho e estabilizado, mas já passou 24h desde a última: coleta', async () => {
    mediaInsightsRows = [snap(daysAgo(2), 100), snap(daysAgo(2), 100)]
    setResponse('timestamp:m1', { ok: true, body: { timestamp: daysAgo(45) } })
    expect(await shouldCollect(target)).toBe(true)
  })
})

describe('collectMediaInsights', () => {
  it('só considera mídia com trigger, fluxo e conta ativos, e nunca sobrescreve — sempre insere', async () => {
    triggerRows = [
      { account_id: 'acc-1', media_id: 'm1', accounts: { access_token: 'tok' } },
      { account_id: 'acc-1', media_id: 'm1', accounts: { access_token: 'tok' } }, // duplicado, mesmo trigger repetido
    ]
    setResponse('insights:m1', { ok: true, body: { data: [datum('views', 5)] } })

    const result = await collectMediaInsights()

    expect(result.collected).toBe(1)
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].account_id).toBe('acc-1')
    expect(insertedRows[0].media_id).toBe('m1')
  })

  it('erro numa mídia não derruba a coleta das outras nem lança', async () => {
    silence()
    triggerRows = [
      { account_id: 'acc-1', media_id: 'quebrado', accounts: { access_token: 'tok' } },
      { account_id: 'acc-1', media_id: 'ok', accounts: { access_token: 'tok' } },
    ]
    setResponse('insights:quebrado', { ok: false, body: { error: { message: 'token invalido' } } })
    setResponse('insights:ok', { ok: true, body: { data: [datum('views', 1)] } })

    await expect(collectMediaInsights()).resolves.toMatchObject({ collected: 1 })
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].media_id).toBe('ok')
  })
})
