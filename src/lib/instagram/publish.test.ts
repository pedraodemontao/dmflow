import { afterEach, describe, expect, it, vi } from 'vitest'

import { MetaSendError } from '@/lib/instagram/errors'
import {
  PublishError,
  fetchPublishingQuota,
  isPermanentPublishError,
  publishPublication,
  waitUntilFinished,
  type ContainerIds,
} from '@/lib/instagram/publish'

/**
 * O caminho de publicação contra um `fetch` simulado.
 *
 * O que estes casos guardam é o que duplica post em silêncio: container
 * recriado numa retentativa, `media_publish` chamado num container que a Meta
 * já publicou, orçamento estourado tratado como falha definitiva. A chamada
 * real é validada à mão, contra a conta, na definição de pronto do card 04.
 */

interface Call {
  method: string
  path: string
  body: Record<string, string>
}

/**
 * Simula a Graph: cada POST em /media devolve um id sequencial, o status de
 * cada container vem de `statuses` (padrão FINISHED), e `media_publish`
 * devolve o id do post.
 */
function fakeGraph(options: { statuses?: Record<string, Array<Record<string, string>>>; failPublish?: boolean } = {}) {
  const calls: Call[] = []
  let next = 1
  const statuses = options.statuses ?? {}

  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url, init) => {
    const parsed = new URL(url)
    const path = parsed.pathname.replace('/v23.0', '')
    const body = Object.fromEntries(new URLSearchParams((init?.body as URLSearchParams | undefined)?.toString() ?? ''))
    calls.push({ method: init?.method ?? 'GET', path, body })

    if (init?.method === 'POST' && path.endsWith('/media')) {
      return new Response(JSON.stringify({ id: `c${next++}` }), { status: 200 })
    }
    if (init?.method === 'POST' && path.endsWith('/media_publish')) {
      if (options.failPublish) {
        return new Response(JSON.stringify({ error: { code: 190, message: 'token morto' } }), { status: 400 })
      }
      return new Response(JSON.stringify({ id: 'post-1' }), { status: 200 })
    }
    if (parsed.searchParams.get('fields') === 'status_code,status') {
      const id = path.slice(1)
      const queue = statuses[id]
      const state = queue && queue.length > 0 ? (queue.length > 1 ? queue.shift() : queue[0]) : { status_code: 'FINISHED' }
      return new Response(JSON.stringify(state), { status: 200 })
    }
    if (parsed.searchParams.get('fields') === 'quota_usage,config') {
      return new Response(JSON.stringify({ data: [{ quota_usage: 3, config: { quota_total: 100 } }] }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: { message: `rota inesperada ${path}` } }), { status: 404 })
  })

  vi.stubGlobal('fetch', fetchMock)
  return { calls, posts: () => calls.filter((c) => c.method === 'POST') }
}

const creds = { igUserId: '17841400000', accessToken: 'tok' }

function run(args: {
  kind: 'image' | 'carousel' | 'reel' | 'story'
  mediaUrls: string[]
  containerIds?: ContainerIds
  budgetMs?: number
}) {
  const persisted: ContainerIds[] = []
  const result = publishPublication({
    ...creds,
    kind: args.kind,
    caption: 'legenda',
    mediaUrls: args.mediaUrls,
    containerIds: args.containerIds ?? {},
    persist: async (ids) => {
      persisted.push(structuredClone(ids))
    },
    budgetMs: args.budgetMs ?? 1_000,
    pollMs: 0,
  })
  return { result, persisted }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('publishPublication', () => {
  it('carrossel: N filhos → espera → pai → espera → publish, persistindo a cada container', async () => {
    const graph = fakeGraph()
    const { result, persisted } = run({ kind: 'carousel', mediaUrls: ['https://x/1.jpg', 'https://x/2.jpg'] })

    await expect(result).resolves.toEqual({ platformMediaId: 'post-1' })

    const posts = graph.posts()
    expect(posts.map((c) => c.path)).toEqual([
      '/17841400000/media',
      '/17841400000/media',
      '/17841400000/media',
      '/17841400000/media_publish',
    ])
    expect(posts[0].body).toMatchObject({ image_url: 'https://x/1.jpg', is_carousel_item: 'true' })
    expect(posts[0].body.caption).toBeUndefined()
    expect(posts[2].body).toMatchObject({ media_type: 'CAROUSEL', children: 'c1,c2', caption: 'legenda' })
    expect(posts[3].body).toEqual({ creation_id: 'c3' })

    // Três gravações: depois do filho 1, do filho 2 e do pai — nunca antes.
    expect(persisted).toEqual([{ children: ['c1'] }, { children: ['c1', 'c2'] }, { children: ['c1', 'c2'], parent: 'c3' }])
  })

  it('retoma de container_ids parcial sem recriar o que já existe', async () => {
    const graph = fakeGraph()
    const { result, persisted } = run({
      kind: 'carousel',
      mediaUrls: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
      containerIds: { children: ['antigo-1', 'antigo-2'] },
    })

    await expect(result).resolves.toEqual({ platformMediaId: 'post-1' })

    const mediaPosts = graph.posts().filter((c) => c.path.endsWith('/media'))
    // Só o terceiro filho e o pai foram criados.
    expect(mediaPosts).toHaveLength(2)
    expect(mediaPosts[0].body.image_url).toBe('https://x/3.jpg')
    expect(mediaPosts[1].body.children).toBe('antigo-1,antigo-2,c1')
    expect(persisted[0]).toEqual({ children: ['antigo-1', 'antigo-2', 'c1'] })
  })

  it('pai já gravado: vai direto para a espera e o publish', async () => {
    const graph = fakeGraph()
    const { result } = run({ kind: 'image', mediaUrls: ['https://x/1.jpg'], containerIds: { parent: 'pai-antigo' } })

    await expect(result).resolves.toEqual({ platformMediaId: 'post-1' })
    expect(graph.posts()).toHaveLength(1)
    expect(graph.posts()[0].body).toEqual({ creation_id: 'pai-antigo' })
  })

  it('container em ERROR é permanente e não chama media_publish', async () => {
    const graph = fakeGraph({ statuses: { c1: [{ status_code: 'ERROR', status: 'Media format unsupported' }] } })
    const { result } = run({ kind: 'image', mediaUrls: ['https://x/1.png'] })

    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PublishError)
    expect(isPermanentPublishError(error)).toBe(true)
    expect((error as Error).message).toContain('Media format unsupported')
    expect(graph.posts().some((c) => c.path.endsWith('/media_publish'))).toBe(false)
  })

  it('orçamento estourado é transitório, e o container fica gravado para a próxima rodada', async () => {
    const graph = fakeGraph({ statuses: { c1: [{ status_code: 'IN_PROGRESS' }] } })
    const { result, persisted } = run({ kind: 'reel', mediaUrls: ['https://x/v.mp4'], budgetMs: 0 })

    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PublishError)
    expect(isPermanentPublishError(error)).toBe(false)
    expect(persisted).toEqual([{ children: [], parent: 'c1' }])
    expect(graph.posts().some((c) => c.path.endsWith('/media_publish'))).toBe(false)
  })

  it('container já PUBLISHED não é republicado', async () => {
    const graph = fakeGraph({ statuses: { 'pai-antigo': [{ status_code: 'PUBLISHED' }] } })
    const { result } = run({ kind: 'image', mediaUrls: ['https://x/1.jpg'], containerIds: { parent: 'pai-antigo' } })

    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PublishError)
    expect(isPermanentPublishError(error)).toBe(true)
    expect(graph.posts()).toHaveLength(0)
  })

  it('carrossel fora de 2–10 itens é recusado antes de qualquer chamada', async () => {
    const graph = fakeGraph()
    const { result } = run({ kind: 'carousel', mediaUrls: ['https://x/1.jpg'] })

    await expect(result).rejects.toBeInstanceOf(PublishError)
    expect(graph.calls).toHaveLength(0)
  })

  it('story manda media_type STORIES sem caption', async () => {
    const graph = fakeGraph()
    const { result } = run({ kind: 'story', mediaUrls: ['https://x/s.jpg'] })

    await expect(result).resolves.toEqual({ platformMediaId: 'post-1' })
    expect(graph.posts()[0].body).toEqual({ media_type: 'STORIES', image_url: 'https://x/s.jpg' })
  })

  it('reel manda video_url e cover_url; imagem solta leva a legenda', async () => {
    const graph = fakeGraph()
    await publishPublication({
      ...creds,
      kind: 'reel',
      caption: 'leg',
      mediaUrls: ['https://x/v.mp4'],
      coverUrl: 'https://x/capa.jpg',
      containerIds: {},
      persist: async () => {},
      pollMs: 0,
    })
    expect(graph.posts()[0].body).toEqual({
      media_type: 'REELS',
      video_url: 'https://x/v.mp4',
      caption: 'leg',
      cover_url: 'https://x/capa.jpg',
    })

    const image = fakeGraph()
    await run({ kind: 'image', mediaUrls: ['https://x/1.jpg'] }).result
    expect(image.posts()[0].body).toEqual({ image_url: 'https://x/1.jpg', caption: 'legenda' })
  })

  it('erro da Graph vira MetaSendError e respeita a classificação de errors.ts', async () => {
    fakeGraph({ failPublish: true })
    const { result } = run({ kind: 'image', mediaUrls: ['https://x/1.jpg'] })

    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(MetaSendError)
    // 190 é token morto: permanente na lista de errors.ts.
    expect(isPermanentPublishError(error)).toBe(true)
  })
})

describe('waitUntilFinished', () => {
  it('sonda até FINISHED e devolve o status', async () => {
    fakeGraph({ statuses: { c9: [{ status_code: 'IN_PROGRESS' }, { status_code: 'IN_PROGRESS' }, { status_code: 'FINISHED' }] } })
    await expect(waitUntilFinished({ containerId: 'c9', accessToken: 'tok', pollMs: 0 })).resolves.toBe('FINISHED')
  })
})

describe('fetchPublishingQuota', () => {
  it('lê uso e teto do content_publishing_limit', async () => {
    fakeGraph()
    await expect(fetchPublishingQuota(creds)).resolves.toEqual({ used: 3, total: 100 })
  })
})
