import { loadModelingContext } from '@/lib/ai/context'
import { scoreLibrary } from '@/lib/ai/retrieve'
import { scriptSchema, type Script as ScriptOutput } from '@/lib/ai/schemas'
import { getAccount } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ContentPillar, LibraryItem, Persona, Script as ScriptRow } from '@/types/db'

/**
 * O contexto que o gerador de carrossel recebe (card 05, fase 3).
 *
 * Três origens, e a prioridade é do pedido mais específico:
 *
 *   roteiro  → o carrossel é a mesma ideia, lida em vez de falada
 *   item     → modelado num vídeo que viralizou (reaproveita `loadModelingContext`)
 *   livre    → pilar + tema, com o acervo inteiro como referência
 *
 * Reaproveita `loadModelingContext` para o item de propósito: é o mesmo
 * grounding do roteiro — persona do item, pilar, refs pontuadas — e dois
 * carregadores para a mesma coisa divergiriam na primeira correção.
 */

export type CarouselSource = 'script' | 'item' | 'free'

export interface CarouselSourceArgs {
  libraryItemId?: string | null
  scriptId?: string | null
  pillarId?: string | null
  theme: string | null
}

export type CarouselContextProblem =
  | 'sem-conta'
  | 'sem-persona'
  | 'sem-etapa'
  | 'item-nao-encontrado'
  | 'roteiro-nao-encontrado'
  | 'roteiro-invalido'

export interface CarouselContext {
  accountId: string
  /** Sem `@` — vai para o cabeçalho da capa. */
  handle: string
  persona: Persona
  pillarId: string | null
  pillar: string
  theme: string | null
  refs: LibraryItem[]
  modeledOn: LibraryItem | null
  fromScript: ScriptOutput | null
}

export type CarouselContextResult =
  | { ok: true; context: CarouselContext }
  | { ok: false; problem: CarouselContextProblem }

/** Quantos itens do acervo entram como referência no tema livre. */
const POOL_LIMIT = 40
const REF_LIMIT = 6

/** Roteiro ganha do item; os dois juntos não fazem sentido, e o roteiro é o pedido mais específico. */
export function pickSource(args: Pick<CarouselSourceArgs, 'libraryItemId' | 'scriptId'>): CarouselSource {
  if (args.scriptId) return 'script'
  if (args.libraryItemId) return 'item'
  return 'free'
}

export async function activePersona(accountId: string, personaId: string | null): Promise<Persona | null> {
  if (personaId) {
    const { data } = await supabaseAdmin.from('personas').select('*').eq('id', personaId).maybeSingle()
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

async function pillarNamed(personaId: string, pillarId: string | null): Promise<ContentPillar | null> {
  if (!pillarId) return null
  const { data } = await supabaseAdmin
    .from('content_pillars')
    .select('*')
    .eq('id', pillarId)
    .eq('persona_id', personaId)
    .maybeSingle()
  return (data as ContentPillar | null) ?? null
}

export async function loadCarouselContext(args: CarouselSourceArgs): Promise<CarouselContextResult> {
  const account = await getAccount()
  if (!account) return { ok: false, problem: 'sem-conta' }
  const handle = account.username ?? ''

  const source = pickSource(args)

  if (source === 'item') {
    const loaded = await loadModelingContext({
      libraryItemId: args.libraryItemId as string,
      funnelStage: 'meio',
      pillarId: args.pillarId ?? undefined,
      theme: args.theme,
    })
    if (!loaded.ok) return { ok: false, problem: loaded.problem }

    const c = loaded.context
    return {
      ok: true,
      context: {
        accountId: c.accountId,
        handle,
        persona: c.persona,
        pillarId: c.pillar?.id ?? null,
        pillar: c.pillarName,
        theme: args.theme,
        refs: c.refs,
        modeledOn: c.item,
        fromScript: null,
      },
    }
  }

  if (source === 'script') {
    const { data } = await supabaseAdmin
      .from('scripts')
      .select('*')
      .eq('id', args.scriptId as string)
      .eq('account_id', account.id)
      .maybeSingle()
    const script = (data as ScriptRow | null) ?? null
    if (!script) return { ok: false, problem: 'roteiro-nao-encontrado' }

    // Só roteiro de Reel vira carrossel. Um carrossel gravado em `scripts` tem
    // outra forma de `output` e não passaria no schema — é o mesmo erro.
    const parsed = scriptSchema.safeParse(script.output)
    if (!parsed.success) return { ok: false, problem: 'roteiro-invalido' }

    const persona = await activePersona(account.id, script.persona_id)
    if (!persona) return { ok: false, problem: 'sem-persona' }
    const pillar = await pillarNamed(persona.id, script.pillar_id)

    let modeledOn: LibraryItem | null = null
    if (script.source_library_item_id) {
      const { data: item } = await supabaseAdmin
        .from('library_items')
        .select('*')
        .eq('id', script.source_library_item_id)
        .maybeSingle()
      modeledOn = (item as LibraryItem | null) ?? null
    }

    return {
      ok: true,
      context: {
        accountId: account.id,
        handle,
        persona,
        pillarId: pillar?.id ?? null,
        pillar: pillar?.name ?? script.theme ?? 'roteiro',
        theme: args.theme ?? script.theme,
        refs: [],
        modeledOn,
        fromScript: parsed.data,
      },
    }
  }

  const persona = await activePersona(account.id, null)
  if (!persona) return { ok: false, problem: 'sem-persona' }
  const pillar = await pillarNamed(persona.id, args.pillarId ?? null)

  const { data: poolRows } = await supabaseAdmin
    .from('library_items')
    .select('*')
    .eq('account_id', account.id)
    .order('outlier', { ascending: false, nullsFirst: false })
    .limit(POOL_LIMIT)
  const pool = (poolRows as LibraryItem[] | null) ?? []
  const pillarName = pillar?.name ?? 'livre'

  return {
    ok: true,
    context: {
      accountId: account.id,
      handle,
      persona,
      pillarId: pillar?.id ?? null,
      pillar: pillarName,
      theme: args.theme,
      refs: scoreLibrary(pool, `${pillarName} ${args.theme ?? ''}`, REF_LIMIT),
      modeledOn: null,
      fromScript: null,
    },
  }
}
