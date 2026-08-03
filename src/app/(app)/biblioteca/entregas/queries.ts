import 'server-only'

import { parseDeliveryBlocks, type DeliveryBlock } from '@/lib/ai/schemas'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { DeliveryStatus } from '@/types/db'

/**
 * Leitura de entregas. Mesma ressalva de `../queries.ts`: o lugar definitivo
 * destas consultas seria `src/lib/data.ts`, mas o arquivo está sendo editado
 * por outro agente em paralelo (métricas de automação) — nasce aqui para não
 * disputar linha com ele.
 */

export interface DeliveryListItem {
  id: string
  title: string
  subtitle: string | null
  slug: string
  status: DeliveryStatus
  createdAt: string
  publishedAt: string | null
  visits: number
  /**
   * O conteúdo vem junto da lista de propósito. Rascunho responde 404 em
   * `/e/[slug]`, então sem os blocos aqui a única forma de ler o que o modelo
   * escreveu seria publicando — e aí o texto ruim já estaria público e já
   * teria ido para lead. A prévia tem que vir ANTES da decisão de publicar.
   */
  blocks: DeliveryBlock[]
}

/** Aba "Entregas": lista completa, mais recente primeiro, com contagem de visita. */
export async function getDeliveries(): Promise<DeliveryListItem[]> {
  const { data: rows, error } = await supabaseAdmin
    .from('deliveries')
    .select('id, title, subtitle, slug, status, created_at, published_at, blocks')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dm-flow] entregas indisponíveis:', error.message)
    return []
  }

  const deliveries = (rows ?? []) as Array<{
    id: string
    title: string
    subtitle: string | null
    slug: string
    status: DeliveryStatus
    created_at: string
    published_at: string | null
    blocks: unknown
  }>

  if (deliveries.length === 0) return []

  // Uma consulta só com todas as visitas das entregas em tela; contadas em
  // JS. Mesma escolha de `getLibraryScreen` para `categories`: nada aqui
  // passa de umas poucas centenas de linhas, single-tenant.
  const { data: viewRows, error: viewsError } = await supabaseAdmin
    .from('delivery_views')
    .select('delivery_id')
    .in(
      'delivery_id',
      deliveries.map((d) => d.id),
    )

  if (viewsError) {
    console.error('[dm-flow] visitas de entrega indisponíveis:', viewsError.message)
  }

  const visitCount = new Map<string, number>()
  for (const row of (viewRows ?? []) as Array<{ delivery_id: string }>) {
    visitCount.set(row.delivery_id, (visitCount.get(row.delivery_id) ?? 0) + 1)
  }

  return deliveries.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    slug: row.slug,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    visits: visitCount.get(row.id) ?? 0,
    // `parseDeliveryBlocks` descarta bloco de tipo desconhecido em vez de
    // lançar: entrega gravada por uma versão anterior do schema aparece com
    // o que dá para mostrar, em vez de derrubar a lista inteira.
    blocks: parseDeliveryBlocks(row.blocks),
  }))
}

export interface DeliveryOption {
  id: string
  title: string
  status: DeliveryStatus
}

/** Seletor de entrega vinculada no editor do fluxo — lista enxuta. */
export async function getDeliveryOptions(): Promise<DeliveryOption[]> {
  const { data, error } = await supabaseAdmin
    .from('deliveries')
    .select('id, title, status')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dm-flow] opções de entrega indisponíveis:', error.message)
    return []
  }

  return (data ?? []) as DeliveryOption[]
}

export interface FlowTarget {
  flowId: string
  name: string
  isActive: boolean
  /** Entrega vinculada hoje — para marcar "já usa esta" e permitir desvincular. */
  deliveryId: string | null
  /** Se o texto do fluxo já chama `{{presente}}`. Vincular sem isso não manda nada. */
  usesPresente: boolean
}

/**
 * Automações que podem receber uma entrega, para vincular sem sair da aba.
 *
 * `usesPresente` existe porque vincular é metade do trabalho: se nenhum bloco
 * do fluxo escreve `{{presente}}`, o vínculo não faz nada e a tela precisa
 * dizer isso — senão o dono vincula, acha que resolveu, e a DM continua saindo
 * com o link velho.
 */
export async function getFlowTargets(): Promise<FlowTarget[]> {
  const { data, error } = await supabaseAdmin
    .from('flows')
    .select('id, name, is_active, delivery_id, definition')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dm-flow] automações indisponíveis:', error.message)
    return []
  }

  return ((data ?? []) as Array<{
    id: string
    name: string
    is_active: boolean
    delivery_id: string | null
    definition: unknown
  }>).map((row) => ({
    flowId: row.id,
    name: row.name,
    isActive: row.is_active,
    deliveryId: row.delivery_id,
    // Busca na definição serializada: `{{presente}}` pode estar no texto, no
    // título de um botão ou na legenda de uma mídia, e procurar campo por
    // campo daria a mesma resposta com mais chance de esquecer um.
    usesPresente: JSON.stringify(row.definition ?? {}).includes('{{presente}}'),
  }))
}

export interface DeliveryBadge {
  id: string
  slug: string
  status: DeliveryStatus
}

/**
 * Para o card da biblioteca: "este item já tem entrega?" — a mais recente
 * quando houver mais de uma (cada clique em "Gerar roteiro" cria uma nova).
 */
export async function getDeliveriesByLibraryItem(
  libraryItemIds: string[],
): Promise<Map<string, DeliveryBadge>> {
  if (libraryItemIds.length === 0) return new Map()

  const { data, error } = await supabaseAdmin
    .from('deliveries')
    .select('id, slug, status, library_item_id, created_at')
    .in('library_item_id', libraryItemIds)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dm-flow] entregas por item indisponíveis:', error.message)
    return new Map()
  }

  const byItem = new Map<string, DeliveryBadge>()
  for (const row of (data ?? []) as Array<{
    id: string
    slug: string
    status: DeliveryStatus
    library_item_id: string | null
  }>) {
    // Ordenado por created_at desc: a primeira vez que um library_item_id
    // aparece já é a entrega mais recente dele — as seguintes são ignoradas.
    if (row.library_item_id && !byItem.has(row.library_item_id)) {
      byItem.set(row.library_item_id, { id: row.id, slug: row.slug, status: row.status })
    }
  }

  return byItem
}
