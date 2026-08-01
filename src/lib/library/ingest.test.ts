import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O que quebra em silêncio na ingestão.
 *
 * Nenhuma das três falhas cobertas aqui levanta exceção: item repetido que
 * derruba o lote inteiro no `ON CONFLICT`, raspagem nova que apaga o
 * enriquecimento de IA que custou tokens, e mediana calculada sobre a contagem
 * errada — que faz a tela ordenar por um outlier que não existe.
 *
 * Supabase é simulado com um array em memória, no mesmo espírito de
 * `actions.test.ts` e `engine.test.ts`.
 */

type Row = Record<string, unknown>

let libraryItems: Row[] = []
let trackedProfiles: Row[] = []

function rowsOf(table: string): Row[] {
  if (table === 'library_items') return libraryItems
  if (table === 'tracked_profiles') return trackedProfiles
  return []
}

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
    return { data: rows, error: null }
  }

  const builder: Record<string, unknown> = {}
  const chain = () => builder

  builder.select = chain
  builder.order = chain
  builder.limit = chain
  builder.not = chain

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

  builder.upsert = (rows: Row[], options: { onConflict: string; ignoreDuplicates?: boolean }) => {
    const keys = options.onConflict.split(',').map((key) => key.trim())
    const store = rowsOf(table)

    for (const incoming of rows) {
      const existing = store.find((row) => keys.every((key) => row[key] === incoming[key]))
      if (existing) {
        if (options.ignoreDuplicates) continue
        // O ponto do teste: só as colunas PRESENTES no payload entram no
        // `DO UPDATE SET`. É o que preserva o enriquecimento por IA.
        Object.assign(existing, incoming)
      } else {
        store.push({ id: `item-${store.length + 1}`, ...incoming })
      }
    }

    return builder
  }

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

const {
  ingestScrapedPosts,
  mergeWithExisting,
  parseApifyPosts,
  profileMetrics,
  recomputeProfileMetrics,
  parseApifyErrors,
} = await import('@/lib/library/ingest')

const ACCOUNT_ID = 'acc-1'
const PROFILE_ID = 'perfil-1'

/** Uma resposta da Apify, do jeito que ela volta de verdade. */
function apifyPost(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://www.instagram.com/reel/AAA/',
    type: 'Video',
    productType: 'clips',
    ownerUsername: 'matheus.apps',
    displayUrl: 'https://scontent.cdninstagram.com/capa.jpg?assinatura=1',
    videoViewCount: 4719,
    videoPlayCount: 112806,
    likesCount: 3200,
    commentsCount: 180,
    videoDuration: 41.3,
    caption: 'Como eu automatizei meu funil com IA',
    timestamp: '2026-07-20T12:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  libraryItems = []
  trackedProfiles = [{ id: PROFILE_ID, account_id: ACCOUNT_ID, median_plays: null }]
})

describe('parseApifyPosts', () => {
  it('guarda plays e views separados — são números diferentes', () => {
    const [item] = parseApifyPosts([apifyPost()])

    // 4.719 views contra 112.806 plays no MESMO vídeo, medido de verdade.
    // Uma cair para a outra faria a mediana comparar duas réguas.
    expect(item.plays).toBe(112806)
    expect(item.views).toBe(4719)
  })

  it('não preenche plays com views quando o ator não manda playCount', () => {
    const [item] = parseApifyPosts([apifyPost({ videoPlayCount: null })])

    expect(item.plays).toBe(0)
    expect(item.views).toBe(4719)
  })

  it('deduplica por external_url', () => {
    // O Postgres recusa `ON CONFLICT` com a mesma chave duas vezes no mesmo
    // comando: um repetido derrubaria o lote inteiro, e a rodada já foi paga.
    const items = parseApifyPosts([
      apifyPost({ likesCount: 10 }),
      apifyPost({ likesCount: 999 }),
    ])

    expect(items).toHaveLength(1)
    expect(items[0].likes).toBe(10)
  })

  it('descarta o que não é vídeo', () => {
    const items = parseApifyPosts([
      apifyPost({ url: 'https://www.instagram.com/p/FOTO/', type: 'Image', videoPlayCount: null, videoViewCount: null }),
      apifyPost(),
    ])

    expect(items).toHaveLength(1)
    expect(items[0].postType).toBe('clips')
  })

  it('trata curtida escondida (-1) como zero e legenda ausente como vazia', () => {
    const [item] = parseApifyPosts([apifyPost({ likesCount: -1, caption: null })])

    expect(item.likes).toBe(0)
    expect(item.caption).toBe('')
  })

  it('ignora item malformado sem derrubar os outros', () => {
    const items = parseApifyPosts([{ nada: true }, null, apifyPost()])

    expect(items).toHaveLength(1)
  })
})

describe('mergeWithExisting', () => {
  const item = parseApifyPosts([apifyPost()])[0]

  const base = {
    accountId: ACCOUNT_ID,
    profileId: PROFILE_ID,
    category: 'vibe-coding',
    item,
    scrapedAt: '2026-07-31T00:00:00.000Z',
  }

  it('não carrega as colunas de enriquecimento por IA', () => {
    // Coluna ausente do payload é coluna que o `ON CONFLICT DO UPDATE` não
    // toca. Incluí-las apagaria em silêncio o que torna o vídeo modelável.
    const row = mergeWithExisting({ ...base, existing: undefined })

    for (const coluna of ['visual_format', 'format_desc', 'hook_text', 'structure', 'watched']) {
      expect(row).not.toHaveProperty(coluna)
    }
  })

  it('métrica nova ganha da antiga', () => {
    const row = mergeWithExisting({
      ...base,
      existing: {
        id: 'item-1',
        external_url: item.externalUrl,
        caption: 'legenda antiga',
        thumb_url: 'capa-velha.jpg',
        posted_at: '2026-07-20T12:00:00.000Z',
        duration_sec: 41,
      },
    })

    expect(row.plays).toBe(112806)
    // A capa é URL ASSINADA QUE EXPIRA: refrescar é o que faz a miniatura
    // continuar aparecendo semanas depois.
    expect(row.thumb_url).toContain('assinatura=1')
  })

  it('campo vazio não sobrescreve o que já estava lá', () => {
    const mudo = parseApifyPosts([apifyPost({ caption: '', displayUrl: null, timestamp: null })])[0]

    const row = mergeWithExisting({
      ...base,
      item: mudo,
      existing: {
        id: 'item-1',
        external_url: mudo.externalUrl,
        caption: 'legenda antiga',
        thumb_url: 'capa-velha.jpg',
        posted_at: '2026-07-20T12:00:00.000Z',
        duration_sec: 41,
      },
    })

    expect(row.caption).toBe('legenda antiga')
    expect(row.thumb_url).toBe('capa-velha.jpg')
    expect(row.posted_at).toBe('2026-07-20T12:00:00.000Z')
  })
})

describe('profileMetrics', () => {
  const amostra = (plays: number[]) =>
    plays.map((valor, index) => ({
      id: `item-${index}`,
      plays: valor,
      likes: 100,
      comments: 10,
      outlier: null,
      engagement: null,
    }))

  it('usa a mediana e ignora o viral solitário', () => {
    const { medianPlays, changed } = profileMetrics(amostra([1000, 1000, 1000, 1000, 1000, 100_000]))

    expect(medianPlays).toBe(1000)
    // O viral vira 100×; sem mediana ele puxaria a régua e se esconderia.
    expect(changed.find((row) => row.id === 'item-5')?.outlier).toBe(100)
  })

  it('recusa outlier com amostra pequena', () => {
    // MIN_AMOSTRA é 6: com 5 vídeos a "mediana do perfil" é ruído.
    const { changed } = profileMetrics(amostra([1000, 1000, 1000, 1000, 5000]))

    expect(changed.every((row) => row.outlier === null)).toBe(true)
    // Engajamento não depende da amostra: (likes + comments) / plays.
    expect(changed[0].engagement).toBe(0.11)
  })

  it('só devolve o que mudou', () => {
    const rows = amostra([1000, 1000, 1000, 1000, 1000, 100_000]).map((row) => ({
      ...row,
      outlier: row.plays === 100_000 ? 100 : 1,
      engagement: Number((110 / row.plays).toFixed(4)),
    }))

    expect(profileMetrics(rows).changed).toHaveLength(0)
  })

  it('aceita numeric vindo como string do PostgREST', () => {
    const rows = amostra([1000, 1000, 1000, 1000, 1000, 100_000]).map((row) => ({
      ...row,
      outlier: row.plays === 100_000 ? '100' : '1',
      engagement: String(Number((110 / row.plays).toFixed(4))),
    }))

    expect(profileMetrics(rows).changed).toHaveLength(0)
  })
})

describe('ingestScrapedPosts', () => {
  const profiles = [{ id: PROFILE_ID, username: 'matheus.apps', category: 'vibe-coding' }]

  it('grava o que é novo e escopa por conta', async () => {
    const result = await ingestScrapedPosts({
      accountId: ACCOUNT_ID,
      profiles,
      raw: [apifyPost(), apifyPost({ url: 'https://www.instagram.com/reel/BBB/' })],
    })

    expect(result.inserted).toBe(2)
    expect(result.updated).toBe(0)
    expect(result.profileIds).toEqual([PROFILE_ID])
    expect(libraryItems).toHaveLength(2)
    expect(libraryItems[0].account_id).toBe(ACCOUNT_ID)
    expect(libraryItems[0].profile_id).toBe(PROFILE_ID)
  })

  it('descarta item de perfil que não é acompanhado', async () => {
    const result = await ingestScrapedPosts({
      accountId: ACCOUNT_ID,
      profiles,
      raw: [apifyPost({ ownerUsername: 'conta.marcada' })],
    })

    expect(result.kept).toBe(0)
    expect(libraryItems).toHaveLength(0)
  })

  it('item que já existe é ATUALIZADO, não substituído', async () => {
    await ingestScrapedPosts({ accountId: ACCOUNT_ID, profiles, raw: [apifyPost()] })

    // Enriquecimento por IA entra depois da raspagem e custa tokens.
    Object.assign(libraryItems[0], {
      visual_format: 'talking_head',
      hook_text: 'Você está perdendo dinheiro com isso',
      structure: 'gancho -> problema -> demo -> CTA',
      watched: true,
    })

    const result = await ingestScrapedPosts({
      accountId: ACCOUNT_ID,
      profiles,
      raw: [apifyPost({ videoPlayCount: 200_000, likesCount: 5000 })],
    })

    expect(result.inserted).toBe(0)
    expect(result.updated).toBe(1)
    expect(libraryItems).toHaveLength(1)
    // Métrica refrescou...
    expect(libraryItems[0].plays).toBe(200_000)
    expect(libraryItems[0].likes).toBe(5000)
    // ...e o enriquecimento sobreviveu. Este é o teste que impede a regressão
    // mais cara da feature: raspar de novo e perder o que a IA já leu.
    expect(libraryItems[0].visual_format).toBe('talking_head')
    expect(libraryItems[0].hook_text).toBe('Você está perdendo dinheiro com isso')
    expect(libraryItems[0].structure).toBe('gancho -> problema -> demo -> CTA')
    expect(libraryItems[0].watched).toBe(true)
  })
})

describe('recomputeProfileMetrics', () => {
  it('reescreve a mediana do perfil e o outlier de TODOS os itens dele', async () => {
    const plays = [1000, 1000, 1000, 1000, 1000, 60_000]
    libraryItems = plays.map((valor, index) => ({
      id: `item-${index}`,
      account_id: ACCOUNT_ID,
      profile_id: PROFILE_ID,
      plays: valor,
      likes: 100,
      comments: 10,
      outlier: null,
      engagement: null,
    }))

    const result = await recomputeProfileMetrics({
      accountId: ACCOUNT_ID,
      profileIds: [PROFILE_ID],
    })

    expect(result.profiles).toBe(1)
    expect(trackedProfiles[0].median_plays).toBe(1000)
    // O item antigo também é reescrito: a mediana é propriedade do conjunto, e
    // um vídeo novo muda o outlier de todos os anteriores. Deixar os antigos
    // com o número velho compararia dois vídeos contra réguas diferentes.
    expect(libraryItems[0].outlier).toBe(1)
    expect(libraryItems[5].outlier).toBe(60)
  })

  it('perfil que falha não leva os outros junto', async () => {
    const result = await recomputeProfileMetrics({
      accountId: ACCOUNT_ID,
      profileIds: ['perfil-sem-item'],
    })

    // Sem item, a mediana é nula e ninguém explode.
    expect(result.errors).toHaveLength(0)
    expect(result.items).toBe(0)
  })
})

describe('parseApifyErrors', () => {
  it('nomeia o perfil que não existe mais', () => {
    // Caso real de 01/08/2026: @maxcarrau.ia estava na curadoria de julho e foi
    // renomeado ou apagado. A Apify avisou; o pipeline descartava em silêncio.
    const erros = parseApifyErrors([
      {
        url: 'https://www.instagram.com/maxcarrau.ia/',
        username: 'maxcarrau.ia',
        error: 'not_found',
        errorDescription: 'Post does not exist',
      },
    ])

    expect(erros).toHaveLength(1)
    expect(erros[0].handle).toBe('maxcarrau.ia')
    expect(erros[0].reason).toContain('não existe mais')
  })

  it('tira o @ da URL quando o campo username não vem', () => {
    const erros = parseApifyErrors([
      { url: 'https://www.instagram.com/algum.perfil/', error: 'not_found' },
    ])

    expect(erros[0].handle).toBe('algum.perfil')
  })

  it('repassa a descrição para erro que não é not_found', () => {
    const erros = parseApifyErrors([
      { url: 'https://www.instagram.com/x/', error: 'private', errorDescription: 'Conta privada' },
    ])

    expect(erros[0].reason).toBe('Conta privada')
  })

  it('ignora post normal', () => {
    expect(parseApifyErrors([{ url: 'https://instagram.com/p/abc', type: 'Video' }])).toHaveLength(0)
  })
})

describe('mediana com contagem par', () => {
  it('arredonda, senão o Postgres recusa e o perfil fica sem régua', () => {
    // `median_plays` é bigint. Mediana de lista par é a média dos dois do meio
    // e pode sair com meio: `invalid input syntax for type bigint: "12157.5"`.
    // O erro ia para o relatório e a coluna ficava nula — nenhum vídeo daquele
    // perfil ganhava multiplicador. Pegou @maxcarrau.ia em 01/08/2026.
    const rows = [
      { id: 'a', plays: 12_000, likes: 0, comments: 0, outlier: null, engagement: null },
      { id: 'b', plays: 12_315, likes: 0, comments: 0, outlier: null, engagement: null },
    ]

    const { medianPlays } = profileMetrics(rows as never)

    expect(medianPlays).toBe(12_158)
    expect(Number.isInteger(medianPlays)).toBe(true)
  })
})
