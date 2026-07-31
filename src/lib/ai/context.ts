import { formatHookPatterns, scoreLibrary } from '@/lib/ai/retrieve'
import { getAccount } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type {
  ContentPillar,
  FunnelStage,
  FunnelStageKey,
  LibraryItem,
  Persona,
} from '@/types/db'

/**
 * Junta do banco tudo que o gerador precisa. É aqui que o princípio "a
 * inteligência é dado" encosta na infraestrutura: nenhuma dessas linhas tem
 * texto de prompt, elas só BUSCAM as linhas que viram prompt.
 *
 * Persona ou etapa faltando é erro explícito, não valor padrão. Um CTA
 * inventado no código para cobrir `funnel_stages` vazia seria exatamente o
 * prompt hardcoded que este porte existe para não ter — e o dono nunca
 * descobriria que a tabela está vazia, porque o roteiro sairia mesmo assim.
 */

/** Quantas referências entram no prompt. Mais que isso afoga o pedido. */
const REF_LIMIT = 6

/**
 * Tamanho da amostra que o RAG textual pontua. Vem ordenada por outlier, então
 * são os vídeos mais replicáveis da conta — não os mais recentes.
 */
const POOL_LIMIT = 40

export type ContextProblem = 'sem-conta' | 'sem-persona' | 'sem-etapa' | 'item-nao-encontrado'

export interface ScriptContext {
  accountId: string
  persona: Persona
  stage: FunnelStage
  pillar: ContentPillar | null
  pillarName: string
  item: LibraryItem
  refs: LibraryItem[]
  hookPatterns: string | null
}

export interface ModelingArgs {
  libraryItemId: string
  funnelStage: FunnelStageKey
  pillarId?: string
  theme: string | null
}

type LoadResult =
  | { ok: true; context: ScriptContext }
  | { ok: false; problem: ContextProblem }

/**
 * A persona do item quando ele tem uma; senão a persona ativa da conta.
 * Single-tenant com mais de um nicho ainda é possível — o item é que sabe a
 * qual deles pertence.
 */
async function findPersona(accountId: string, personaId: string | null): Promise<Persona | null> {
  if (personaId) {
    const { data } = await supabaseAdmin
      .from('personas')
      .select('*')
      .eq('id', personaId)
      .maybeSingle()

    if (data) return data as Persona
  }

  const { data } = await supabaseAdmin
    .from('personas')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  return (data as Persona | null) ?? null
}

export async function loadModelingContext(args: ModelingArgs): Promise<LoadResult> {
  const account = await getAccount()
  if (!account) return { ok: false, problem: 'sem-conta' }

  const { data: itemRow } = await supabaseAdmin
    .from('library_items')
    .select('*')
    .eq('id', args.libraryItemId)
    .eq('account_id', account.id)
    .maybeSingle()

  const item = (itemRow as LibraryItem | null) ?? null
  if (!item) return { ok: false, problem: 'item-nao-encontrado' }

  const persona = await findPersona(account.id, item.persona_id)
  if (!persona) return { ok: false, problem: 'sem-persona' }

  const { data: stageRow } = await supabaseAdmin
    .from('funnel_stages')
    .select('*')
    .eq('persona_id', persona.id)
    .eq('key', args.funnelStage)
    .maybeSingle()

  const stage = (stageRow as FunnelStage | null) ?? null
  if (!stage) return { ok: false, problem: 'sem-etapa' }

  let pillar: ContentPillar | null = null
  if (args.pillarId) {
    const { data } = await supabaseAdmin
      .from('content_pillars')
      .select('*')
      .eq('id', args.pillarId)
      .eq('persona_id', persona.id)
      .maybeSingle()

    pillar = (data as ContentPillar | null) ?? null
  }

  const { data: poolRows } = await supabaseAdmin
    .from('library_items')
    .select('*')
    .eq('account_id', account.id)
    .neq('id', item.id)
    .order('outlier', { ascending: false, nullsFirst: false })
    .limit(POOL_LIMIT)

  const pool = (poolRows as LibraryItem[] | null) ?? []
  const pillarName = pillar?.name ?? item.category ?? 'modelado'

  return {
    ok: true,
    context: {
      accountId: account.id,
      persona,
      stage,
      pillar,
      pillarName,
      item,
      refs: scoreLibrary(pool, `${pillarName} ${args.theme ?? ''}`, REF_LIMIT),
      hookPatterns: formatHookPatterns(pool),
    },
  }
}
