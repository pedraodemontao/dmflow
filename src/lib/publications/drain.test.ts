import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A drenagem contra um Supabase e uma Graph simulados.
 *
 * O que estes casos guardam é o que já sumiu com uma fila em produção:
 * adiamento que vira falha (attempts subindo por cap), claim que não é
 * claim, e o post publicado que o banco não registra.
 */

interface State {
  rows: Record<string, unknown>[]
  account: Record<string, unknown> | null
  publishedCount: number
  countError: boolean
  claimSucceeds: boolean
  /** Falha a primeira gravação com `status: 'published'`. */
  failPublishedWrite: boolean
  updates: Array<{ payload: Record<string, unknown>; id?: string }>
  requeued: string[]
}

let state: State

/** Encadeamento mínimo do PostgREST que a drenagem usa. */
function fakeQuery(table: string) {
  const q: Record<string, unknown> = {}
  let op: 'select' | 'update' = 'select'
  let payload: Record<string, unknown> = {}
  let head = false
  let selectAfterUpdate = false
  const filters: Record<string, unknown> = {}

  const chain = () => q
  q.select = (_cols?: string, opts?: { head?: boolean }) => {
    if (op === 'update') selectAfterUpdate = true
    head = Boolean(opts?.head)
    return q
  }
  q.update = (p: Record<string, unknown>) => {
    op = 'update'
    payload = p
    return q
  }
  q.eq = (col: string, value: unknown) => {
    filters[col] = value
    return q
  }
  q.lt = chain
  q.lte = chain
  q.gte = chain
  q.order = chain
  q.limit = chain

  q.single = async () => ({ data: table === 'accounts' ? state.account : null })

  // Claim: update ... eq(status, scheduled) ... select('id').maybeSingle()
  q.maybeSingle = async () => {
    if (op === 'update' && filters.status === 'scheduled') {
      return { data: state.claimSucceeds ? { id: filters.id } : null }
    }
    return { data: null }
  }

  q.then = (resolve: (value: unknown) => unknown) => {
    if (op === 'update') {
      // Requeue: update ... eq(status, publishing) ... select('id')
      if (selectAfterUpdate && filters.status === 'publishing') {
        return resolve({ data: state.requeued.map((id) => ({ id })), error: null })
      }
      state.updates.push({ payload, id: filters.id as string | undefined })
      if (payload.status === 'published' && state.failPublishedWrite) {
        state.failPublishedWrite = false
        return resolve({ error: { message: 'conexão caiu' } })
      }
      return resolve({ error: null })
    }
    if (head) {
      return resolve(state.countError ? { count: null, error: { message: 'timeout' } } : { count: state.publishedCount, error: null })
    }
    return resolve({ data: state.rows, error: null })
  }

  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

vi.mock('@/lib/env', () => ({
  env: { SUPABASE_URL: 'https://proj.supabase.co', PUBLISH_DAILY_CAP: 3 },
}))

const publishMock = vi.fn()
const quotaMock = vi.fn()

vi.mock('@/lib/instagram/publish', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/instagram/publish')>()
  return {
    ...original,
    publishPublication: (args: unknown) => publishMock(args),
    fetchPublishingQuota: () => quotaMock(),
    fetchPermalink: async () => 'https://www.instagram.com/p/abc/',
  }
})

const { PublishError } = await import('@/lib/instagram/publish')
const { MAX_ATTEMPTS, drainScheduledPublications, requeueStuckPublications, retryDelayMs } = await import(
  '@/lib/publications/drain'
)

const NOW = new Date('2026-08-30T12:00:00.000Z')

function publication(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pub-1',
    account_id: 'acc-1',
    kind: 'carousel',
    caption: 'legenda',
    media_paths: ['carousel/s1/1/0.jpg', 'carousel/s1/1/1.jpg'],
    cover_path: null,
    status: 'scheduled',
    scheduled_at: '2026-08-30T11:50:00.000Z',
    published_at: null,
    container_ids: { children: ['c-antigo'] },
    platform_media_id: null,
    permalink: null,
    attempts: 0,
    error: null,
    flow_id: null,
    script_id: null,
    ...over,
  }
}

function account(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'acc-1',
    ig_user_id: 'ig-1',
    username: 'dono',
    access_token: 'tok',
    is_active: true,
    automations_paused: false,
    quiet_from: null,
    quiet_to: null,
    ...over,
  }
}

const lastUpdate = () => state.updates.at(-1)?.payload

beforeEach(() => {
  state = {
    rows: [publication()],
    account: account(),
    publishedCount: 0,
    countError: false,
    claimSucceeds: true,
    failPublishedWrite: false,
    updates: [],
    requeued: [],
  }
  publishMock.mockReset().mockResolvedValue({ platformMediaId: 'post-1' })
  quotaMock.mockReset().mockResolvedValue({ used: 0, total: 100 })
})

describe('drainScheduledPublications', () => {
  it('claim → publica → grava published com id e permalink', async () => {
    const result = await drainScheduledPublications(NOW)

    expect(result).toMatchObject({ published: 1, failed: 0 })
    expect(publishMock).toHaveBeenCalledTimes(1)
    const args = publishMock.mock.calls[0][0] as Record<string, unknown>
    expect(args).toMatchObject({ igUserId: 'ig-1', accessToken: 'tok', kind: 'carousel', caption: 'legenda' })
    // URL montada a partir do caminho, nunca lida do banco.
    expect(args.mediaUrls).toEqual([
      'https://proj.supabase.co/storage/v1/object/public/publication-media/carousel/s1/1/0.jpg',
      'https://proj.supabase.co/storage/v1/object/public/publication-media/carousel/s1/1/1.jpg',
    ])
    // Retomada: o que já existia na Meta chega inteiro ao orquestrador.
    expect(args.containerIds).toEqual({ children: ['c-antigo'] })

    expect(lastUpdate()).toMatchObject({
      status: 'published',
      published_at: NOW.toISOString(),
      platform_media_id: 'post-1',
      permalink: 'https://www.instagram.com/p/abc/',
      error: null,
    })
  })

  it('claim perdido não publica nem mexe em attempts', async () => {
    state.claimSucceeds = false

    const result = await drainScheduledPublications(NOW)

    expect(result.published).toBe(0)
    expect(publishMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('cap diário estourado adia: sem claim, sem attempts', async () => {
    state.publishedCount = 3

    const result = await drainScheduledPublications(NOW)

    expect(result.deferred).toBe(1)
    expect(publishMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('erro ao contar o cap conta como cap estourado', async () => {
    state.countError = true

    await drainScheduledPublications(NOW)

    expect(publishMock).not.toHaveBeenCalled()
  })

  it('cota da Meta estourada ou indisponível adia', async () => {
    quotaMock.mockResolvedValue({ used: 100, total: 100 })
    await drainScheduledPublications(NOW)
    expect(publishMock).not.toHaveBeenCalled()

    quotaMock.mockRejectedValue(new Error('rede'))
    await drainScheduledPublications(NOW)
    expect(publishMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('pânico ligado adia sem claim', async () => {
    state.account = account({ automations_paused: true })

    const result = await drainScheduledPublications(NOW)

    expect(result.deferred).toBe(1)
    expect(state.updates).toHaveLength(0)
  })

  it('falha transitória volta para scheduled com backoff e attempts + 1', async () => {
    publishMock.mockRejectedValue(new PublishError('ainda IN_PROGRESS', false))

    const result = await drainScheduledPublications(NOW)

    expect(result).toMatchObject({ deferred: 1, failed: 0 })
    const update = lastUpdate()
    expect(update).toMatchObject({ status: 'scheduled', attempts: 1, error: 'ainda IN_PROGRESS' })
    expect(update?.scheduled_at).toBe(new Date(NOW.getTime() + retryDelayMs(1)).toISOString())
    // container_ids não entra na gravação de falha: o que foi persistido no meio fica.
    expect(update).not.toHaveProperty('container_ids')
  })

  it('falha permanente vira failed na primeira', async () => {
    publishMock.mockRejectedValue(new PublishError('container em ERROR', true))

    const result = await drainScheduledPublications(NOW)

    expect(result.failed).toBe(1)
    expect(lastUpdate()).toMatchObject({ status: 'failed', attempts: 1, error: 'container em ERROR' })
  })

  it('a última tentativa desiste mesmo sendo transitória', async () => {
    state.rows = [publication({ attempts: MAX_ATTEMPTS - 1 })]
    publishMock.mockRejectedValue(new PublishError('rede', false))

    await drainScheduledPublications(NOW)

    expect(lastUpdate()).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS })
  })

  it('publicado mas sem conseguir gravar: failed com o id do post no erro, nunca retentativa', async () => {
    state.failPublishedWrite = true

    const result = await drainScheduledPublications(NOW)

    expect(result.failed).toBe(1)
    const update = lastUpdate()
    expect(update?.status).toBe('failed')
    expect(String(update?.error)).toContain('post-1')
  })

  it('uma publicação por conta por tick', async () => {
    state.rows = [publication({ id: 'pub-1' }), publication({ id: 'pub-2' })]

    const result = await drainScheduledPublications(NOW)

    expect(result.published).toBe(1)
    expect(publishMock).toHaveBeenCalledTimes(1)
  })

  it('publicação sem mídia é permanente e não chama a Meta', async () => {
    state.rows = [publication({ media_paths: [] })]

    const result = await drainScheduledPublications(NOW)

    expect(result.failed).toBe(1)
    expect(publishMock).not.toHaveBeenCalled()
    expect(lastUpdate()).toMatchObject({ status: 'failed' })
  })
})

describe('requeueStuckPublications', () => {
  it('devolve quantas voltaram para a fila', async () => {
    state.requeued = ['pub-7', 'pub-8']
    await expect(requeueStuckPublications(NOW)).resolves.toBe(2)
  })
})

describe('retryDelayMs', () => {
  it('cresce e trava no último degrau', () => {
    expect(retryDelayMs(1)).toBe(2 * 60_000)
    expect(retryDelayMs(3)).toBe(15 * 60_000)
    expect(retryDelayMs(99)).toBe(60 * 60_000)
  })
})
