import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O cliente da Apify, sem tocar na Apify.
 *
 * Toda chamada real gasta crédito de um plano grátis de US$ 5/mês, então
 * `fetch` é simulado — e é justamente o que precisa de teste: o filtro por
 * handle (que evita envenenar a mediana), a retentativa (que existe por causa
 * de timeout transitório de verdade) e o respeito ao orçamento de tempo, que é
 * o que impede a função serverless morrer no meio.
 */

import {
  ApifyError,
  fetchDatasetItems,
  getLastRun,
  isRunActive,
  keepRequestedHandles,
  startRun,
  waitForRun,
  type ApifyRun,
} from '@/lib/library/apify'

const DEADLINE = () => Date.now() + 30_000

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const run = (overrides: Partial<ApifyRun> = {}): ApifyRun => ({
  id: 'run-1',
  status: 'SUCCEEDED',
  defaultDatasetId: 'ds-1',
  startedAt: '2026-07-31T10:00:00.000Z',
  finishedAt: '2026-07-31T10:02:00.000Z',
  ...overrides,
})

beforeEach(() => {
  process.env.APIFY_TOKEN = 'token-de-teste'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('keepRequestedHandles', () => {
  const items = [
    { ownerUsername: 'matheus.apps', url: 'https://instagram.com/p/a' },
    { ownerUsername: 'ContaMarcada', url: 'https://instagram.com/p/b' },
    { ownerUsername: 'MATHEUS.APPS', url: 'https://instagram.com/p/c' },
    { url: 'https://instagram.com/p/d' },
  ]

  it('descarta post de conta que não foi pedida', () => {
    // A Apify devolve publicação de conta MARCADA no post do perfil pedido.
    // Sem este filtro ela entraria sem perfil e, se por acaso a conta marcada
    // também fosse acompanhada, os posts dela envenenariam a mediana do perfil
    // errado — e mediana errada esconde outlier em silêncio.
    const kept = keepRequestedHandles(items, ['matheus.apps'])

    expect(kept).toHaveLength(2)
    expect(kept.map((item) => (item as { url: string }).url)).toEqual([
      'https://instagram.com/p/a',
      'https://instagram.com/p/c',
    ])
  })

  it('compara sem ligar para caixa nem para o arroba', () => {
    expect(keepRequestedHandles(items, ['@ContaMarcada '])).toHaveLength(1)
  })

  it('item sem dono não passa', () => {
    expect(keepRequestedHandles([{ url: 'x' }], ['qualquer'])).toHaveLength(0)
  })
})

describe('isRunActive', () => {
  it('trata os estados de transição como ativos', () => {
    // ABORTING e TIMING-OUT ainda podem virar outra coisa: começar uma rodada
    // nova por cima delas seria pagar duas vezes.
    expect(isRunActive(run({ status: 'RUNNING' }))).toBe(true)
    expect(isRunActive(run({ status: 'READY' }))).toBe(true)
    expect(isRunActive(run({ status: 'ABORTING' }))).toBe(true)
    expect(isRunActive(run({ status: 'SUCCEEDED' }))).toBe(false)
    expect(isRunActive(run({ status: 'FAILED' }))).toBe(false)
    expect(isRunActive(null)).toBe(false)
  })
})

describe('getLastRun', () => {
  it('devolve a última rodada — o estado durável que evita tabela nova', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: run({ status: 'RUNNING' }) }))
    vi.stubGlobal('fetch', fetchMock)

    const last = await getLastRun(DEADLINE())

    expect(last?.id).toBe('run-1')
    expect(isRunActive(last)).toBe(true)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/acts/apify~instagram-scraper/runs/last')
    // O token vai no cabeçalho, nunca na URL: mensagem de erro daqui carrega a
    // URL e viraria segredo em log da Vercel.
    expect(url).not.toContain('token')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-de-teste')
  })

  it('nunca ter rodado não é erro', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: {} }, 404))

    await expect(getLastRun(DEADLINE())).resolves.toBeNull()
  })
})

describe('startRun', () => {
  it('manda o input que o script original provou que funciona', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: run({ status: 'READY' }) }))
    vi.stubGlobal('fetch', fetchMock)

    await startRun({
      handles: ['matheus.apps', 'jp.asv'],
      resultsLimit: 12,
      deadlineAt: DEADLINE(),
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      directUrls: [
        'https://www.instagram.com/matheus.apps/',
        'https://www.instagram.com/jp.asv/',
      ],
      resultsType: 'posts',
      resultsLimit: 12,
      addParentData: false,
    })
  })
})

describe('retentativa', () => {
  it('insiste em erro transitório e devolve o resultado', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ETIMEDOUT'))
      .mockResolvedValueOnce(jsonResponse([{ ownerUsername: 'x' }]))
    vi.stubGlobal('fetch', fetchMock)

    // Espera crescente começa em 3 s; o orçamento precisa comportá-la.
    const items = await fetchDatasetItems('ds-1', Date.now() + 20_000)

    expect(items).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('não espera por uma retentativa que o teto da função não deixa acontecer', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ETIMEDOUT'))
    vi.stubGlobal('fetch', fetchMock)

    // Orçamento menor que a primeira espera: desiste na hora em vez de ser
    // morta no meio pela Vercel.
    await expect(fetchDatasetItems('ds-1', Date.now() + 100)).rejects.toBeInstanceOf(ApifyError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('waitForRun', () => {
  it('devolve nulo quando o orçamento acaba — a rodada continua viva na Apify', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ data: run({ status: 'RUNNING' }) }))

    // Sem tempo para o próximo polling: retorna null e NÃO aborta. Abortar
    // jogaria fora resultado já cobrado.
    await expect(waitForRun({ runId: 'run-1', deadlineAt: Date.now() + 200 })).resolves.toBeNull()
  })

  it('devolve a rodada terminada mesmo quando ela falhou', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ data: run({ status: 'FAILED' }) }))

    const terminada = await waitForRun({ runId: 'run-1', deadlineAt: DEADLINE() })

    // O que já entrou no dataset até a falha foi cobrado: coletar é o certo.
    expect(terminada?.status).toBe('FAILED')
  })
})

describe('token', () => {
  it('sem APIFY_TOKEN falha com mensagem que diz o que fazer', async () => {
    delete process.env.APIFY_TOKEN
    vi.stubGlobal('fetch', async () => jsonResponse({ data: run() }))

    await expect(getLastRun(DEADLINE())).rejects.toThrow(/APIFY_TOKEN/)
  })
})
