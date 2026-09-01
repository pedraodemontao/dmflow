/**
 * Da resposta da Apify para `library_items`.
 *
 * Duas metades: a de cima é pura (validar, mapear, deduplicar, recalcular) e
 * está sob teste; a de baixo fala com o Supabase. A divisão não é estética —
 * o que quebra em silêncio aqui é justamente a parte pura: item duplicado que
 * vira dois, enriquecimento de IA apagado por uma raspagem nova, mediana
 * calculada sobre a contagem errada. Nada disso levanta exceção.
 */
import { z } from 'zod'

import { median, engagementRate, outlierScore } from '@/lib/library/outlier'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ============================================================
// Parte pura
// ============================================================

/**
 * O que a Apify devolve, do que a gente usa. `passthrough` implícito: campo
 * desconhecido é ignorado em vez de derrubar o item — o ator muda de versão
 * sozinho e a raspagem não pode parar por causa de uma chave nova.
 */
const apifyPostSchema = z.object({
  url: z.string().url(),
  type: z.string().nullish(),
  productType: z.string().nullish(),
  ownerUsername: z.string().nullish(),
  displayUrl: z.string().nullish(),
  /** Contagem restrita. NÃO é a régua do outlier. */
  videoViewCount: z.number().nullish(),
  /** O número que o reel mostra publicamente. É sobre ele que o outlier é calculado. */
  videoPlayCount: z.number().nullish(),
  likesCount: z.number().nullish(),
  commentsCount: z.number().nullish(),
  videoDuration: z.number().nullish(),
  caption: z.string().nullish(),
  timestamp: z.string().nullish(),
  /**
   * O que o vídeo PROVOCOU. A legenda diz o que o autor quis dizer; o
   * comentário diz o que ficou na cabeça de quem viu — a dúvida, o pedido, o
   * "que ferramenta é essa". Para a análise de conteúdo vale mais que a
   * legenda, e já vinha pago na mesma raspagem, descartado.
   */
  latestComments: z
    .array(z.object({ text: z.string().nullish(), ownerUsername: z.string().nullish() }))
    .nullish(),
  hashtags: z.array(z.string()).nullish(),
  /** Publi teve empurrão pago: comparar com orgânico na mesma régua mistura duas coisas. */
  paidPartnership: z.boolean().nullish(),
  dimensionsHeight: z.number().nullish(),
  dimensionsWidth: z.number().nullish(),
})

export interface ScrapedItem {
  externalUrl: string
  ownerHandle: string
  postType: string
  thumbUrl: string | null
  views: number
  plays: number
  likes: number
  comments: number
  durationSec: number | null
  caption: string
  postedAt: string | null
  topComments: Array<{ text: string; author: string | null }>
  hashtags: string[]
  isPaidPartnership: boolean
  /** Altura ÷ largura. 1,78 é o 9:16 do reel; 1,0 é quadrado. */
  aspectRatio: number | null
}

/**
 * Altura ÷ largura, arredondado a duas casas. Nulo quando falta dimensão — e
 * nulo é honesto: chutar 1,78 porque "reel costuma ser vertical" plantaria um
 * dado falso na análise de formato, que é justamente o que ela vai ler.
 */
function aspect(height: number | null | undefined, width: number | null | undefined): number | null {
  if (typeof height !== 'number' || typeof width !== 'number') return null
  if (!Number.isFinite(height) || !Number.isFinite(width) || width <= 0 || height <= 0) return null
  return Math.round((height / width) * 100) / 100
}

/** Contagem não-negativa. A Apify manda -1 quando o perfil esconde as curtidas. */
function count(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Valida, mapeia e DEDUPLICA por `external_url`.
 *
 * `external_url` é a chave única de `library_items` (`unique (account_id,
 * external_url)`), e o dataset repete: o mesmo reel volta em páginas
 * diferentes quando o perfil publica durante a raspagem. Deduplicar aqui, e
 * não no banco, é o que impede o upsert em lote falhar inteiro por conflito
 * consigo mesmo — o Postgres recusa `ON CONFLICT` com a mesma chave duas vezes
 * no MESMO comando, e aí a rodada toda se perde por causa de um item repetido.
 *
 * Primeiro a chegar vence: o dataset vem do mais recente para o mais antigo.
 */
/**
 * A Apify devolve o erro DENTRO do dataset, misturado com os posts.
 *
 * Quando o perfil não existe mais, ela entrega `{url, error: 'not_found',
 * errorDescription: 'Post does not exist'}` no lugar dos posts. Descartar isso
 * em silêncio — que era o que acontecia — custou uma rodada paga e um
 * diagnóstico genérico: o dono viu "confira os @" quando o sistema tinha a
 * resposta exata na mão. Aconteceu de verdade com @maxcarrau.ia em 01/08/2026,
 * perfil que existia na curadoria de julho e foi renomeado ou apagado desde
 * então.
 */
const apifyErrorSchema = z.object({
  url: z.string().nullish(),
  username: z.string().nullish(),
  error: z.string(),
  errorDescription: z.string().nullish(),
})

export interface ApifyItemError {
  handle: string | null
  reason: string
}

/** Erros por item, para a tela dizer QUAL perfil falhou e por quê. */
export function parseApifyErrors(raw: unknown[]): ApifyItemError[] {
  return raw.flatMap((entry) => {
    const parsed = apifyErrorSchema.safeParse(entry)
    if (!parsed.success) return []

    const { url, username, error, errorDescription } = parsed.data
    const doUrl = url?.match(/instagram\.com\/([^/?]+)/)?.[1] ?? null

    return [
      {
        handle: username ?? doUrl,
        reason:
          error === 'not_found'
            ? 'não existe mais (renomeado ou apagado)'
            : (errorDescription ?? error),
      },
    ]
  })
}

export function parseApifyPosts(raw: unknown[]): ScrapedItem[] {
  const porUrl = new Map<string, ScrapedItem>()

  for (const entry of raw) {
    const parsed = apifyPostSchema.safeParse(entry)
    if (!parsed.success) continue

    const post = parsed.data
    const handle = post.ownerUsername?.trim().toLowerCase()
    if (!handle) continue

    // Vídeo e carrossel entram; foto solta continua fora. O carrossel ganhou
    // régua própria (mediana de curtidas, migration 0025) — antes era descartado
    // gancho falado nem estrutura para copiar.
    const isVideo =
      post.type === 'Video' ||
      typeof post.videoPlayCount === 'number' ||
      typeof post.videoViewCount === 'number'
    const isSidecar = post.type === 'Sidecar'
    if (!isVideo && !isSidecar) continue

    if (porUrl.has(post.url)) continue

    porUrl.set(post.url, {
      externalUrl: post.url,
      ownerHandle: handle,
      // `productType` distingue reel ('clips') de vídeo de feed; o `type` só
      // diz "Video". Guardar o mais específico não custa nada e a tela filtra.
      postType: isSidecar ? 'Sidecar' : post.productType?.trim() || post.type?.trim() || 'Video',
      thumbUrl: post.displayUrl?.trim() || null,
      // As DUAS contagens, sem uma cair para a outra. Num vídeo real deram
      // 4.719 views contra 112.806 plays — 24× de diferença. Preencher plays
      // com views quando plays falta faria a mediana do perfil comparar duas
      // réguas diferentes e inventar outlier onde não há.
      views: count(post.videoViewCount),
      plays: count(post.videoPlayCount),
      likes: count(post.likesCount),
      comments: count(post.commentsCount),
      durationSec: post.videoDuration ? Math.round(post.videoDuration) : null,
      // Legenda inteira, diferente do script original que cortava em 500: lá o
      // destino era um JSON em disco, aqui ela alimenta o índice de busca em
      // português e o enriquecimento por IA, que precisa do gancho literal.
      caption: post.caption?.trim() ?? '',
      postedAt: isoOrNull(post.timestamp),
      // Teto de 12: passa disso e o comentário deixa de informar e vira
      // ruído no prompt da análise — os primeiros já mostram o padrão do que
      // as pessoas perguntaram, e cada um a mais é token pago sem retorno.
      topComments: (post.latestComments ?? [])
        .map((c) => ({ text: (c.text ?? '').trim(), author: c.ownerUsername ?? null }))
        .filter((c) => c.text.length > 0)
        .slice(0, 12),
      hashtags: (post.hashtags ?? []).filter((tag) => tag.trim().length > 0),
      isPaidPartnership: post.paidPartnership === true,
      aspectRatio: aspect(post.dimensionsHeight, post.dimensionsWidth),
    })
  }

  return Array.from(porUrl.values())
}

/** O que já está gravado, do que a mesclagem precisa olhar. */
export interface ExistingLibraryRow {
  id: string
  external_url: string
  caption: string | null
  thumb_url: string | null
  posted_at: string | null
  duration_sec: number | null
}

/** A linha que vai para o banco. Note o que NÃO está aqui. */
export interface LibraryItemUpsert {
  account_id: string
  profile_id: string
  source: 'instagram'
  owner_handle: string
  category: string | null
  post_type: string
  external_url: string
  thumb_url: string | null
  views: number
  plays: number
  likes: number
  comments: number
  duration_sec: number | null
  caption: string
  posted_at: string | null
  top_comments: Array<{ text: string; author: string | null }>
  hashtags: string[]
  is_paid_partnership: boolean
  aspect_ratio: number | null
  scraped_at: string
}

/**
 * Item que já existe é ATUALIZADO, não substituído.
 *
 * Métrica muda com o tempo e tem que ser refrescada — é o ponto da raspagem
 * recorrente. Mas `visual_format`, `format_desc`, `hook_text` e `structure`
 * vêm do enriquecimento por IA, custam tokens e NÃO voltam da Apify: se a
 * gravação os incluísse, cada raspagem apagaria em silêncio a única coisa que
 * torna o vídeo modelável em vez de só listável. Por isso essas quatro colunas
 * (mais `watched`, que é marcação do dono, e `persona_id`) não aparecem no
 * payload: coluna ausente do upsert é coluna que o `ON CONFLICT DO UPDATE` não
 * toca. É a mesma decisão do script original, que lia o item existente e só
 * reatribuía views/likes/comments/timestamp.
 *
 * Campo que voltou vazio também não sobrescreve: raspagem que perdeu a legenda
 * não pode zerar a legenda que estava lá.
 */
export function mergeWithExisting(args: {
  accountId: string
  profileId: string
  category: string | null
  item: ScrapedItem
  existing: ExistingLibraryRow | undefined
  scrapedAt: string
}): LibraryItemUpsert {
  const { accountId, profileId, category, item, existing, scrapedAt } = args

  return {
    account_id: accountId,
    profile_id: profileId,
    source: 'instagram',
    owner_handle: item.ownerHandle,
    category,
    post_type: item.postType,
    external_url: item.externalUrl,
    // `thumb_url` é URL ASSINADA QUE EXPIRA (mesma lição de
    // `contacts.profile_pic_url`): refrescar é o único jeito de a capa
    // continuar aparecendo semanas depois.
    thumb_url: item.thumbUrl ?? existing?.thumb_url ?? null,
    views: item.views,
    plays: item.plays,
    likes: item.likes,
    comments: item.comments,
    duration_sec: item.durationSec ?? existing?.duration_sec ?? null,
    caption: item.caption || existing?.caption || '',
    posted_at: item.postedAt ?? existing?.posted_at ?? null,
    // Os campos de análise SOBRESCREVEM em vez de preservar o que existe: ao
    // contrário da legenda, eles são um retrato do post no momento da
    // raspagem, e comentário novo vale mais que comentário velho. Preservar
    // aqui congelaria a leitura do público na primeira vez que vimos o post.
    top_comments: item.topComments,
    hashtags: item.hashtags,
    is_paid_partnership: item.isPaidPartnership,
    aspect_ratio: item.aspectRatio,
    scraped_at: scrapedAt,
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export interface MetricRow {
  id: string
  /** 'Sidecar' compete na régua de curtidas; o resto, na de plays. */
  post_type?: unknown
  plays: unknown
  likes: unknown
  comments: unknown
  outlier: unknown
  engagement: unknown
}

export interface ProfileMetrics {
  /** A régua dos VÍDEOS do perfil. `null` quando não há play nenhum registrado. */
  medianPlays: number | null
  /** A régua dos CARROSSÉIS: mediana de curtidas dos Sidecar. Nula sem amostra. */
  medianCarouselLikes: number | null
  sampleSize: number
  /** Só o que MUDOU. Reescrever linha idêntica é rede à toa. */
  changed: Array<{ id: string; outlier: number | null; engagement: number | null }>
}

/**
 * Recalcula a régua do perfil e o que dela deriva.
 *
 * Roda sobre TODOS os itens do perfil, não só os que acabaram de chegar: a
 * mediana é uma propriedade do conjunto, então um vídeo novo muda o outlier de
 * todos os antigos. Deixar os antigos com o número velho faria a mesma tela
 * mostrar dois vídeos comparados contra réguas diferentes.
 *
 * A matemática mora em `outlier.ts` — aqui só se aplica.
 */
export function profileMetrics(rows: MetricRow[]): ProfileMetrics {
  /**
   * SÓ QUEM TEM PLAY ENTRA NA RÉGUA. Item com zero não é item que foi mal: é
   * item sem medição — a Apify omite `videoPlayCount` quando o perfil esconde
   * as contagens, e no perfil próprio o número só existe para as mídias que o
   * tick alcançou (`media_insights` cobre as dez mais recentes e as com
   * automação, não o acervo inteiro).
   *
   * Contá-los como zero envenena a régua nos dois extremos: com 39 dos 49
   * vídeos sem medição, a mediana do perfil próprio dava ZERO, e mediana zero
   * faz `outlierScore` devolver null para TODOS — o perfil inteiro fica sem
   * multiplicador por causa de dado que nunca foi coletado. É a mesma classe
   * de falha silenciosa do bug do bigint (01/08), por outro caminho.
   *
   * `sampleSize` conta a mesma amostra, e não o total de linhas: quem decide
   * se há amostra suficiente para afirmar um multiplicador é quem tem número,
   * não quem está na tabela.
   */
  // Cada tipo na sua régua: Sidecar não tem play (e um play zero dele NÃO é
  // "sem medição" — é outro esporte), e vídeo não entra na mediana de
  // curtidas de carrossel. Misturar foi exatamente o que a porta antiga
  // evitava descartando; agora se evita separando.
  const videoRows = rows.filter((row) => row.post_type !== 'Sidecar')
  const sidecarRows = rows.filter((row) => row.post_type === 'Sidecar')
  const plays = videoRows.map((row) => toNumber(row.plays) ?? 0).filter((valor) => valor > 0)
  /**
   * Arredondado porque `tracked_profiles.median_plays` é `bigint`.
   *
   * A mediana de uma lista PAR é a média dos dois do meio, então ela sai com
   * meio — e o Postgres recusa: `invalid input syntax for type bigint:
   * "12157.5"`. O erro ia para o relatório, mas a coluna ficava nula, e sem
   * régua nenhum vídeo daquele perfil ganhava multiplicador. Falha silenciosa
   * de meia dúzia de vídeos, que só aparece quando alguém repara que um perfil
   * inteiro está "sem régua".
   *
   * Pegou @maxcarrau.ia em 01/08/2026 e não pegou @dfolloni por sorte: os dois
   * centrais dele davam inteiro. Ou seja, quebrava em metade dos perfis com
   * contagem par.
   *
   * Arredondar e não truncar: meia view não existe, e o erro de arredondamento
   * é irrelevante contra uma mediana de milhares.
   */
  const medianaCrua = median(plays)
  const medianPlays = medianaCrua === null ? null : Math.round(medianaCrua)
  const sampleSize = plays.length

  // Curtida zero num Sidecar também é "sem medição" (perfil que esconde
  // contagem), pela mesma razão do plays.
  const carouselLikes = sidecarRows.map((row) => toNumber(row.likes) ?? 0).filter((valor) => valor > 0)
  const carouselCrua = median(carouselLikes)
  const medianCarouselLikes = carouselCrua === null ? null : Math.round(carouselCrua)
  const carouselSample = carouselLikes.length

  const changed: ProfileMetrics['changed'] = []

  for (const row of rows) {
    const ehSidecar = row.post_type === 'Sidecar'
    // `outlierScore` é uma razão contra a mediana — serve às duas réguas; o
    // que muda é o numerador e a régua, nunca a matemática.
    const outlier = ehSidecar
      ? outlierScore({ plays: toNumber(row.likes), medianPlays: medianCarouselLikes, sampleSize: carouselSample })
      : outlierScore({ plays: toNumber(row.plays), medianPlays, sampleSize })
    // Engajamento divide por plays; carrossel não tem denominador — nulo é
    // honesto, taxa inventada não.
    const engagement = ehSidecar
      ? null
      : engagementRate({
          likes: toNumber(row.likes),
          comments: toNumber(row.comments),
          plays: toNumber(row.plays),
        })

    if (outlier !== toNumber(row.outlier) || engagement !== toNumber(row.engagement)) {
      changed.push({ id: row.id, outlier, engagement })
    }
  }

  return { medianPlays, medianCarouselLikes, sampleSize, changed }
}

// ============================================================
// Parte que fala com o banco
// ============================================================

/** Tamanho de lote das idas ao PostgREST. `in (...)` vira query string; 80 cabe. */
const URL_CHUNK = 80
const WRITE_CHUNK = 200

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export interface IngestProfile {
  id: string
  username: string
  category: string | null
}

export interface IngestResult {
  /** Itens que vieram no dataset. É o que a Apify cobrou. */
  received: number
  /** Itens que sobreviveram ao filtro (vídeo, de perfil acompanhado, sem repetição). */
  kept: number
  inserted: number
  updated: number
  /** Ids de `tracked_profiles` que receberam item — quem precisa de mediana nova. */
  profileIds: string[]
  errors: string[]
}

/**
 * Grava o dataset. Escopado por `account_id` em toda leitura e escrita.
 *
 * Erro de um lote não derruba os outros: raspagem parcial é melhor que
 * raspagem perdida — a rodada da Apify já foi paga, e o que ficou de fora
 * volta na próxima porque `external_url` deduplica.
 */
export async function ingestScrapedPosts(args: {
  accountId: string
  profiles: IngestProfile[]
  raw: unknown[]
}): Promise<IngestResult> {
  const { accountId, profiles, raw } = args
  const errors: string[] = []

  const items = parseApifyPosts(raw)

  // Erro por item vira mensagem nomeando o perfil. A rodada foi paga; o
  // diagnóstico que veio junto é a parte mais barata de aproveitar.
  for (const falha of parseApifyErrors(raw)) {
    errors.push(`@${falha.handle ?? '?'}: ${falha.reason}`)
  }

  const porHandle = new Map(profiles.map((profile) => [profile.username.toLowerCase(), profile]))

  const alvos = items.flatMap((item) => {
    const profile = porHandle.get(item.ownerHandle)
    return profile ? [{ item, profile }] : []
  })

  if (alvos.length === 0) {
    return { received: raw.length, kept: 0, inserted: 0, updated: 0, profileIds: [], errors }
  }

  // O que já existe, para (a) não sobrescrever campo com vazio e (b) saber o
  // que é novo de verdade na contagem que a tela mostra.
  const existentes = new Map<string, ExistingLibraryRow>()

  for (const urls of chunk(alvos.map(({ item }) => item.externalUrl), URL_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from('library_items')
      .select('id, external_url, caption, thumb_url, posted_at, duration_sec')
      .eq('account_id', accountId)
      .in('external_url', urls)

    if (error) {
      errors.push(`leitura de itens existentes: ${error.message}`)
      continue
    }

    for (const row of (data ?? []) as ExistingLibraryRow[]) {
      existentes.set(row.external_url, row)
    }
  }

  const scrapedAt = new Date().toISOString()
  const rows = alvos.map(({ item, profile }) =>
    mergeWithExisting({
      accountId,
      profileId: profile.id,
      category: profile.category,
      item,
      existing: existentes.get(item.externalUrl),
      scrapedAt,
    }),
  )

  let gravados = 0

  for (const lote of chunk(rows, WRITE_CHUNK)) {
    const { error } = await supabaseAdmin
      .from('library_items')
      // `onConflict` na chave única da tabela. A resolução padrão do PostgREST
      // é merge: só as colunas presentes no payload entram no `DO UPDATE SET`,
      // e é exatamente isso que preserva o enriquecimento por IA.
      .upsert(lote, { onConflict: 'account_id,external_url' })

    if (error) {
      errors.push(`gravação de ${lote.length} itens: ${error.message}`)
      continue
    }

    gravados += lote.length
  }

  const novos = rows.filter((row) => !existentes.has(row.external_url)).length
  const profileIds = Array.from(new Set(alvos.map(({ profile }) => profile.id)))

  return {
    received: raw.length,
    kept: rows.length,
    // Proporcional ao que de fato foi gravado: com um lote falho, dizer que
    // tudo entrou seria mentira na tela.
    inserted: gravados === rows.length ? novos : Math.min(novos, gravados),
    updated: Math.max(0, gravados - Math.min(novos, gravados)),
    profileIds,
    errors,
  }
}

/** Teto de itens por perfil na releitura. Perfil com mais que isso já é acervo demais. */
const RECOMPUTE_LIMIT = 1000

/**
 * Refaz `median_plays` do perfil e o `outlier`/`engagement` de cada item dele.
 *
 * Um perfil que falha não leva os outros junto — o `try` é por perfil.
 */
export async function recomputeProfileMetrics(args: {
  accountId: string
  profileIds: string[]
}): Promise<{ profiles: number; items: number; errors: string[] }> {
  const errors: string[] = []
  let profiles = 0
  let items = 0

  for (const profileId of args.profileIds) {
    try {
      const { data, error } = await supabaseAdmin
        .from('library_items')
        .select('id, post_type, plays, likes, comments, outlier, engagement')
        .eq('account_id', args.accountId)
        .eq('profile_id', profileId)
        .limit(RECOMPUTE_LIMIT)

      if (error) throw new Error(error.message)

      const { medianPlays, medianCarouselLikes, changed } = profileMetrics((data ?? []) as MetricRow[])

      const { error: profileError } = await supabaseAdmin
        .from('tracked_profiles')
        .update({ median_plays: medianPlays, median_carousel_likes: medianCarouselLikes })
        .eq('id', profileId)
        .eq('account_id', args.accountId)

      if (profileError) throw new Error(profileError.message)

      for (const item of changed) {
        const { error: itemError } = await supabaseAdmin
          .from('library_items')
          .update({ outlier: item.outlier, engagement: item.engagement })
          .eq('id', item.id)
          .eq('account_id', args.accountId)

        if (itemError) throw new Error(itemError.message)
        items += 1
      }

      profiles += 1
    } catch (error) {
      errors.push(
        `mediana do perfil ${profileId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return { profiles, items, errors }
}
