import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O polling é o único lugar do sistema que falha em SILÊNCIO por definição:
 * ninguém está esperando a resposta dele. Estes testes cobrem os quatro furos
 * de captura que uma auditoria encontrou — erro de fila ignorado com o cursor
 * avançando por cima, erro ao listar contas virando tick saudável, DM sem
 * paginação e thread de comentário nunca varrida.
 *
 * Supabase e a Graph API são simulados; `enqueue`/`processPending` são os
 * REAIS, porque metade do que está sendo testado é justamente a propagação do
 * erro de gravação do `enqueue` até o cursor (mockar isso testaria o mock).
 */

const enqueuedRows: Array<Record<string, unknown>> = []
const cursorUpdates: Array<Record<string, unknown>> = []
const requestedUrls: string[] = []

let accountsRows: Array<Record<string, unknown>>
let accountsError: { message: string } | null
let enqueueError: { message: string } | null
let cursorError: { message: string } | null

/** Encadeamento mínimo do PostgREST usado pelo polling. */
function fakeQuery(table: string) {
  let isUpdate = false
  const builder: Record<string, unknown> = {}
  const chain = () => builder

  builder.select = chain
  builder.eq = chain
  builder.lt = chain
  builder.lte = chain
  builder.is = chain
  builder.order = chain
  builder.limit = chain
  builder.maybeSingle = async () => ({ data: null, error: null })
  builder.single = async () => ({ data: null, error: null })

  builder.update = (patch: Record<string, unknown>) => {
    isUpdate = true
    if (table === 'accounts') cursorUpdates.push(patch)
    return builder
  }

  builder.upsert = async (rows: Array<Record<string, unknown>>) => {
    if (table !== 'webhook_events') return { data: null, error: null }
    if (enqueueError) return { data: null, error: enqueueError }
    enqueuedRows.push(...rows)
    return { data: null, error: null }
  }

  // A listagem de contas e a gravação do cursor são consumidas direto, sem
  // maybeSingle/single no fim — daí o builder também ser "thenable".
  builder.then = (resolve: (value: unknown) => unknown) => {
    if (isUpdate) return Promise.resolve({ data: null, error: cursorError }).then(resolve)
    if (table === 'accounts')
      return Promise.resolve({ data: accountsRows, error: accountsError }).then(resolve)
    return Promise.resolve({ data: [], error: null }).then(resolve)
  }

  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

vi.mock('@/lib/instagram/api', () => ({
  fetchContactProfile: async () => null,
  replyToComment: async () => ({}),
}))

vi.mock('@/lib/flow/engine', () => ({
  startFlow: async () => {},
  resumeFlow: async () => {},
}))

type Body = Record<string, unknown>

/** Páginas por endpoint: 'media', 'conversations', 'comments:<mediaId>'. */
let pages: Record<string, Body[]>

/** Monta um corpo paginado por página, encadeando os cursores `after`. */
function paginate(pagesOfItems: unknown[][]): Body[] {
  return pagesOfItems.map((data, index) => ({
    data,
    ...(index + 1 < pagesOfItems.length
      ? { paging: { next: 'https://graph/next', cursors: { after: String(index + 1) } } }
      : {}),
  }))
}

function routeOf(url: string): string {
  if (url.includes('/me/media')) return 'media'
  if (url.includes('/me/conversations')) return 'conversations'
  const media = /v23\.0\/([^/?]+)\/comments/.exec(url)
  return media ? `comments:${media[1]}` : 'desconhecido'
}

vi.stubGlobal('fetch', async (input: string) => {
  const url = String(input)
  requestedUrls.push(url)

  const list = pages[routeOf(url)] ?? []
  const after = new URL(url).searchParams.get('after')
  const body = list[after ? Number(after) : 0] ?? { data: [] }

  return { ok: true, json: async () => body }
})

const { pollAll } = await import('@/lib/webhook/poll')

const recent = () => new Date().toISOString()
const ancient = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()

function silence() {
  return {
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  }
}

beforeEach(() => {
  enqueuedRows.length = 0
  cursorUpdates.length = 0
  requestedUrls.length = 0

  accountsError = null
  enqueueError = null
  cursorError = null

  accountsRows = [
    {
      id: 'acc-1',
      ig_user_id: 'ig-1',
      username: 'minhaconta',
      access_token: 'token',
      is_active: true,
      // Cutoff efetivo = 10min atrás - 5min de folga = 15min atrás.
      comments_cursor: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      messages_cursor: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  ]

  // Conta com um post e uma conversa, ambos sem novidade desde o cursor.
  pages = {
    media: paginate([[{ id: 'm1' }]]),
    'comments:m1': paginate([[]]),
    conversations: paginate([
      [{ messages: { data: [{ id: 'mid-velha', created_time: ancient(), from: { id: 'lead-1' } }] } }],
    ]),
  }
  vi.restoreAllMocks()
})

/** Eventos que chegaram na fila, já desembrulhados do formato da tabela. */
function queued() {
  return enqueuedRows.map((row) => row.payload as { dedupKey: string; value: Record<string, unknown> })
}

describe('captura de comentário', () => {
  it('comentário novo de um lead entra na fila', async () => {
    pages['comments:m1'] = paginate([
      [{ id: 'c1', text: 'CHECKLIST', timestamp: recent(), from: { id: 'lead-1', username: 'lead' } }],
    ])

    const result = await pollAll()

    expect(result.errors).toEqual([])
    expect(result.comments).toBe(1)
    expect(queued()[0].dedupKey).toBe('comment:c1')
  })

  it('comentário anterior ao cursor não entra', async () => {
    pages['comments:m1'] = paginate([
      [{ id: 'c1', text: 'CHECKLIST', timestamp: ancient(), from: { id: 'lead-1' } }],
    ])

    expect((await pollAll()).comments).toBe(0)
  })

  it('segue a paginação de comentários', async () => {
    pages['comments:m1'] = paginate([
      [{ id: 'c1', text: 'a', timestamp: recent(), from: { id: 'lead-1' } }],
      [{ id: 'c2', text: 'b', timestamp: recent(), from: { id: 'lead-2' } }],
    ])

    await pollAll()

    expect(queued().map((event) => event.dedupKey)).toEqual(['comment:c1', 'comment:c2'])
  })

  it('primeiro nível sem autoria identificável ainda entra (a conta não comenta o próprio post)', async () => {
    pages['comments:m1'] = paginate([[{ id: 'c1', text: 'CHECKLIST', timestamp: recent() }]])

    await pollAll()

    expect(queued()[0].value).toMatchObject({ from: { id: 'comment_author:c1' } })
  })
})

describe('captura dentro da thread', () => {
  /**
   * O caso cotidiano: comentário antigo do lead, o bot respondeu publicamente
   * dentro dele, e a pessoa respondeu de novo NA THREAD. Só o último é evento.
   */
  const threadDoBot = [
    {
      id: 'c1',
      text: 'CHECKLIST',
      timestamp: ancient(),
      from: { id: 'lead-1', username: 'lead' },
      replies: {
        data: [
          { id: 'r-bot', text: 'te mandei no direct 👀', timestamp: ancient(), from: { id: 'ig-1' } },
          {
            id: 'r-lead',
            text: 'não chegou, CHECKLIST',
            timestamp: recent(),
            from: { id: 'lead-1', username: 'lead' },
          },
        ],
      },
    },
  ]

  it('resposta dentro da thread entra na fila, com parent_id e a mídia do pai', async () => {
    pages['comments:m1'] = paginate([threadDoBot])

    await pollAll()

    expect(queued()).toHaveLength(1)
    expect(queued()[0].dedupKey).toBe('comment:r-lead')
    expect(queued()[0].value).toMatchObject({
      id: 'r-lead',
      parent_id: 'c1',
      media: { id: 'm1' },
      from: { id: 'lead-1' },
    })
  })

  it('resposta da própria conta na thread é ignorada (senão o bot responde a si mesmo em laço)', async () => {
    pages['comments:m1'] = paginate([threadDoBot])

    await pollAll()

    expect(queued().map((event) => event.dedupKey)).not.toContain('comment:r-bot')
  })

  it('resposta sem autoria identificável é descartada — na thread, "não sei quem é" pode ser o bot', async () => {
    const spies = silence()
    pages['comments:m1'] = paginate([
      [
        {
          id: 'c1',
          timestamp: ancient(),
          from: { id: 'lead-1' },
          replies: { data: [{ id: 'r-anonima', text: 'CHECKLIST', timestamp: recent() }] },
        },
      ],
    ])

    await pollAll()

    expect(queued()).toHaveLength(0)
    // Descarte silencioso é o que a auditoria estava caçando: fica um aviso.
    expect(spies.warn).toHaveBeenCalled()
  })

  it('a thread não custa requisição a mais: vem por expansão de campo, não por /replies', async () => {
    pages['comments:m1'] = paginate([threadDoBot])

    await pollAll()

    expect(requestedUrls.filter((url) => url.includes('/comments?'))).toHaveLength(1)
    expect(requestedUrls.filter((url) => url.includes('/replies'))).toHaveLength(0)
    expect(requestedUrls[1]).toContain('replies.limit(')
  })
})

describe('cursor', () => {
  it('avança os dois cursores quando a varredura dá certo', async () => {
    await pollAll()

    expect(cursorUpdates.map((patch) => Object.keys(patch)[0])).toEqual([
      'comments_cursor',
      'messages_cursor',
    ])
  })

  it('falha ao enfileirar: o cursor NÃO avança e o tick reporta erro', async () => {
    const spies = silence()
    enqueueError = { message: 'pool esgotado' }
    pages['comments:m1'] = paginate([
      [{ id: 'c1', text: 'CHECKLIST', timestamp: recent(), from: { id: 'lead-1' } }],
    ])
    pages.conversations = paginate([
      [{ messages: { data: [{ id: 'mid-1', created_time: recent(), from: { id: 'lead-1' } }] } }],
    ])

    const result = await pollAll()

    expect(enqueuedRows).toHaveLength(0)
    expect(cursorUpdates).toHaveLength(0)
    // errors não-vazio é o que faz a rota do cron responder 503.
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0].detail).toContain('pool esgotado')
    expect(spies.error).toHaveBeenCalled()
  })

  it('falha só ao gravar o cursor vira log, não derruba o tick', async () => {
    const spies = silence()
    cursorError = { message: 'timeout' }
    pages['comments:m1'] = paginate([
      [{ id: 'c1', text: 'CHECKLIST', timestamp: recent(), from: { id: 'lead-1' } }],
    ])

    const result = await pollAll()

    // O evento entrou na fila; revarrer a mesma janela é de graça (dedup_key).
    expect(queued()).toHaveLength(1)
    expect(result.errors).toEqual([])
    expect(spies.error).toHaveBeenCalled()
  })
})

describe('listagem de contas', () => {
  it('erro ao listar contas vira erro do tick, não tick saudável com zero evento', async () => {
    accountsError = { message: 'banco indisponível' }
    accountsRows = []

    const result = await pollAll()

    expect(result.errors).toEqual([
      { account: '(lista de contas)', detail: 'banco indisponível' },
    ])
  })

  it('zero conta ativa SEM erro continua sendo sucesso (ninguém conectou ainda)', async () => {
    accountsRows = []

    expect((await pollAll()).errors).toEqual([])
  })
})

describe('captura de DM', () => {
  it('segue a paginação de conversas — 15 numa chamada só deixava DM de fora', async () => {
    pages.conversations = paginate([
      [{ messages: { data: [{ id: 'mid-1', created_time: recent(), from: { id: 'lead-1' } }] } }],
      [{ messages: { data: [{ id: 'mid-2', created_time: recent(), from: { id: 'lead-2' } }] } }],
    ])

    const result = await pollAll()

    expect(result.messages).toBe(2)
    expect(queued().map((event) => event.dedupKey)).toEqual(['msg:mid-1', 'msg:mid-2'])
  })

  it('mensagem da própria conta é ignorada', async () => {
    pages.conversations = paginate([
      [{ messages: { data: [{ id: 'mid-1', created_time: recent(), from: { id: 'ig-1' } }] } }],
    ])

    expect((await pollAll()).messages).toBe(0)
  })

  it('mensagem anterior ao cursor é ignorada', async () => {
    pages.conversations = paginate([
      [{ messages: { data: [{ id: 'mid-1', created_time: ancient(), from: { id: 'lead-1' } }] } }],
    ])

    expect((await pollAll()).messages).toBe(0)
  })
})
