import 'server-only'

import {
  LIBRARY_ORDER_PADRAO,
  type LibraryOrder,
  type LibraryStatus,
} from '@/components/biblioteca/query-params'
import { engagementRate } from '@/lib/library/outlier'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { LibraryItem } from '@/types/db'

/**
 * Leitura da biblioteca de referência.
 *
 * PROVISÓRIO NO CAMINHO, não no conteúdo: o lugar definitivo destas consultas é
 * `src/lib/data.ts`, junto de `getContacts` e companhia. Elas nasceram aqui
 * porque aquele arquivo estava sendo editado por outro agente; mover é recortar
 * e colar, e nenhuma tela depende do caminho (só do tipo exportado).
 *
 * Duas coisas moldam este arquivo:
 *
 *   1. **A tabela pode não existir.** A migration é colada à mão no SQL Editor
 *      (ver CLAUDE.md), então "migration aplicada" é estado fora do repositório.
 *      Todo erro do PostgREST vira `tableReady: false` + lista vazia, e a tela
 *      mostra o estado vazio que ensina a rodar a 0014 — nunca um 500.
 *   2. **O outlier vem do banco, não é recalculado aqui.** `library_items.outlier`
 *      é escrito pelo pipeline de raspagem, que é quem sabe o tamanho da amostra
 *      por perfil. Um recorte filtrado NÃO sabe (5 vídeos na tela podem ser 5 de
 *      80), e recalcular com o tamanho errado inventaria "sem régua" em perfil
 *      que tem régua. `engagement` é o oposto: sai de curtidas/comentários/plays
 *      da própria linha, sem depender de amostra, então dá para completar aqui
 *      quando o pipeline ainda não gravou.
 */

/** Teto de linhas por consulta. Acima disto a tela avisa que está cortando. */
export const LIBRARY_LIMIT = 300

/**
 * A categoria que `sync-own.ts` carimba nos posts do dono.
 *
 * A tela é uma biblioteca de REFERÊNCIA — conteúdo dos outros, para modelar. O
 * acervo do dono entra na mesma tabela por decisão de modelagem (mediana,
 * outlier e análise funcionam pelo mesmo caminho, sem tabela nova), mas não é
 * referência: é histórico. Fica oculto por padrão e continua vivo no banco,
 * alimentando o bloco de desempenho próprio do gerador
 * (`src/lib/ai/own-performance.ts`).
 *
 * Escondido, não apagado — e a diferença importa: filtrar por esta categoria
 * na tela traz tudo de volta.
 */
export const CATEGORIA_PROPRIO = 'próprio'

export interface LibraryFilters {
  search?: string
  category?: string
  order?: LibraryOrder
  status?: LibraryStatus
}

/** O item como a tela consome: a linha do banco + o engajamento já resolvido. */
export interface LibraryCardItem extends LibraryItem {
  /** `engagement` da linha ou, na falta dele, (curtidas + comentários) / plays. */
  engagementRate: number | null
}

export interface LibraryProfileSummary {
  id: string
  username: string
  category: string | null
  isActive: boolean
  lastScrapedAt: string | null
}

export interface LibraryScreenData {
  items: LibraryCardItem[]
  /** Total que casa com o filtro, antes do corte de `LIBRARY_LIMIT`. */
  total: number
  truncated: boolean
  /** Existe alguma linha na tabela, ignorando o filtro — separa "vazio" de "filtrado". */
  hasAnyItem: boolean
  categories: string[]
  profiles: LibraryProfileSummary[]
  /** Falso quando a migration 0014 ainda não foi aplicada no banco. */
  tableReady: boolean
}

/** PostgREST devolve `bigint`/`numeric` como número JSON, mas nunca confie: um
 *  `NaN` silencioso aqui viraria "0 plays" no card e "0×" no multiplicador. */
function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

function toCardItem(row: LibraryItem): LibraryCardItem {
  const likes = toNumber(row.likes)
  const comments = toNumber(row.comments)
  const plays = toNumber(row.plays)
  const stored = toNullableNumber(row.engagement)

  return {
    ...row,
    likes,
    comments,
    plays,
    views: toNumber(row.views),
    engagement: stored,
    outlier: toNullableNumber(row.outlier),
    engagementRate: stored ?? engagementRate({ likes, comments, plays }),
  }
}

export async function getLibraryScreen(filters: LibraryFilters = {}): Promise<LibraryScreenData> {
  const order = filters.order ?? LIBRARY_ORDER_PADRAO
  const status = filters.status ?? 'todos'

  let query = supabaseAdmin.from('library_items').select('*', { count: 'exact' })

  if (filters.category) {
    query = query.eq('category', filters.category)
  } else {
    // `neq` sozinho descartaria as linhas de categoria NULA junto: no Postgres,
    // `null != 'próprio'` é NULL, e NULL não passa no filtro. O `or` com
    // `is.null` é o que mantém na tela o item que nunca recebeu categoria.
    query = query.or(`category.is.null,category.neq.${CATEGORIA_PROPRIO}`)
  }
  if (status === 'vistos') query = query.eq('watched', true)
  if (status === 'nao-vistos') query = query.eq('watched', false)

  const search = filters.search?.trim()
  if (search) {
    // `,` e os parênteses separam os OR do PostgREST — busca com vírgula
    // quebraria a query inteira. Mesmo cuidado de `getContacts`.
    const safe = search.replace(/[,()]/g, ' ').trim()
    if (safe) {
      query = query.or(
        [
          `caption.ilike.%${safe}%`,
          `owner_handle.ilike.%${safe}%`,
          `hook_text.ilike.%${safe}%`,
          `structure.ilike.%${safe}%`,
        ].join(','),
      )
    }
  }

  if (order === 'plays') {
    query = query.order('plays', { ascending: false })
  } else if (order === 'recentes') {
    query = query.order('posted_at', { ascending: false, nullsFirst: false })
  } else {
    // Item sem multiplicador vai para o fim, nunca some: "ainda não dá para
    // dizer" continua sendo conteúdo que o dono pode querer olhar.
    query = query
      .order('outlier', { ascending: false, nullsFirst: false })
      .order('plays', { ascending: false })
  }

  const [itemsResult, totalResult, categoriesResult, profilesResult] = await Promise.all([
    query.limit(LIBRARY_LIMIT),
    supabaseAdmin.from('library_items').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('library_items').select('category').not('category', 'is', null).limit(2000),
    supabaseAdmin
      .from('tracked_profiles')
      .select('id, username, category, is_active, last_scraped_at')
      .order('username'),
  ])

  if (profilesResult.error) {
    console.error('[dm-flow] perfis rastreados indisponíveis:', profilesResult.error.message)
  }

  const profiles: LibraryProfileSummary[] = (
    (profilesResult.data ?? []) as Array<{
      id: string
      username: string
      category: string | null
      is_active: boolean
      last_scraped_at: string | null
    }>
  )
    // O perfil do dono sai da lista pelo mesmo motivo que os posts dele: esta
    // lista é de perfis RASTREADOS, e o dele não é raspado — vem da Graph API,
    // de graça, com `is_active = false` para a Apify nunca o pegar.
    .filter((row) => row.category !== CATEGORIA_PROPRIO)
    .map((row) => ({
      id: row.id,
      username: row.username,
      category: row.category,
      isActive: row.is_active,
      lastScrapedAt: row.last_scraped_at,
    }))

  if (itemsResult.error) {
    console.error('[dm-flow] biblioteca indisponível:', itemsResult.error.message)
    return {
      items: [],
      total: 0,
      truncated: false,
      hasAnyItem: false,
      categories: [],
      profiles,
      tableReady: false,
    }
  }

  const items = ((itemsResult.data ?? []) as LibraryItem[]).map(toCardItem)
  const total = itemsResult.count ?? items.length

  const categories = [
    ...new Set(
      ((categoriesResult.data ?? []) as Array<{ category: string | null }>)
        .map((row) => row.category?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return {
    items,
    total,
    truncated: total > items.length,
    hasAnyItem: (totalResult.count ?? 0) > 0,
    categories,
    profiles,
    tableReady: true,
  }
}
