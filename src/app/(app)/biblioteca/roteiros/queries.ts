import { scriptSchema, type Script } from '@/lib/ai/schemas'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { FunnelStageKey } from '@/types/db'

/** Leitura dos roteiros gerados, para a aba que os lista. */

export interface ScriptListItem {
  id: string
  createdAt: string
  funnelStage: FunnelStageKey
  duration: string | null
  modelUsed: string | null
  /** De qual vídeo do acervo este roteiro foi modelado. */
  modeledOn: { handle: string | null; outlier: number | null } | null
  /** A entrega que nasceu junto — o presente que este roteiro promete. */
  delivery: { id: string; title: string; slug: string; status: string } | null
  script: Script | null
}

export async function getScripts(): Promise<ScriptListItem[]> {
  const { data, error } = await supabaseAdmin
    .from('scripts')
    .select('id, created_at, funnel_stage, duration, model_used, output, source_library_item_id')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dm-flow] roteiros indisponíveis:', error.message)
    return []
  }

  const rows = (data ?? []) as Array<{
    id: string
    created_at: string
    funnel_stage: FunnelStageKey
    duration: string | null
    model_used: string | null
    output: unknown
    source_library_item_id: string | null
  }>

  if (rows.length === 0) return []

  // Duas consultas em vez de join aninhado: a origem vem de `library_items` e
  // a entrega de `deliveries`, e o supabase-js aninha mal quando as duas
  // pendem da mesma linha. Nada aqui passa de algumas dezenas de roteiros.
  const itemIds = rows.map((r) => r.source_library_item_id).filter((id): id is string => Boolean(id))

  const [{ data: itens }, { data: entregas }] = await Promise.all([
    itemIds.length > 0
      ? supabaseAdmin.from('library_items').select('id, owner_handle, outlier').in('id', itemIds)
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from('deliveries').select('id, title, slug, status, script_id'),
  ])

  const porItem = new Map(
    ((itens ?? []) as Array<{ id: string; owner_handle: string | null; outlier: number | null }>).map(
      (row) => [row.id, row],
    ),
  )
  const porScript = new Map(
    (
      (entregas ?? []) as Array<{
        id: string
        title: string
        slug: string
        status: string
        script_id: string | null
      }>
    )
      .filter((row) => row.script_id)
      .map((row) => [row.script_id as string, row]),
  )

  return rows.map((row) => {
    const item = row.source_library_item_id ? porItem.get(row.source_library_item_id) : null
    const entrega = porScript.get(row.id)
    // `safeParse` e não `parse`: roteiro gravado por uma versão anterior do
    // schema aparece na lista com o cabeçalho e sem o corpo, em vez de
    // derrubar a página inteira por causa de uma linha velha.
    const parsed = scriptSchema.safeParse(row.output)

    return {
      id: row.id,
      createdAt: row.created_at,
      funnelStage: row.funnel_stage,
      duration: row.duration,
      modelUsed: row.model_used,
      modeledOn: item ? { handle: item.owner_handle, outlier: item.outlier } : null,
      delivery: entrega
        ? { id: entrega.id, title: entrega.title, slug: entrega.slug, status: entrega.status }
        : null,
      script: parsed.success ? parsed.data : null,
    }
  })
}
