/**
 * Gera roteiro + entrega em lote, espelhando /api/scripts/generate-from-item.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/gerar-lote.mts [qtd] [etapa]
 *
 * O `--tsconfig` é obrigatório: ele troca `server-only` por um stub vazio. Sem
 * isso a cadeia `context.ts → data.ts` recusa a importar fora do Next, e é uma
 * recusa correta — este script só a contorna porque roda no terminal do dono,
 * nunca no navegador.
 */
import { loadModelingContext } from '../src/lib/ai/context'
import { generateScript } from '../src/lib/ai/generate'
import { generateDelivery } from '../src/lib/ai/generate-delivery'
import { generateDeliverySlug } from '../src/lib/ai/slug'
import { supabaseAdmin } from '../src/lib/supabase/admin'
import type { FunnelStageKey } from '../src/types/db'

const quantidade = Number(process.argv[2] ?? 3)
const etapa = (process.argv[3] ?? 'meio') as FunnelStageKey

const { data } = await supabaseAdmin
  .from('library_items')
  .select('id, owner_handle, outlier')
  .not('analyzed_at', 'is', null)
  .order('outlier', { ascending: false })
  .limit(quantidade)

for (const item of (data ?? []) as Array<{ id: string; owner_handle: string; outlier: number }>) {
  const loaded = await loadModelingContext({
    libraryItemId: item.id,
    funnelStage: etapa,
    theme: null,
  })
  if (!loaded.ok) {
    console.log(`✗ @${item.owner_handle}: ${loaded.problem}\n`)
    continue
  }
  const c = loaded.context

  const g = await generateScript({
    persona: c.persona,
    stage: c.stage,
    pillar: c.pillarName,
    theme: null,
    duration: '60',
    refs: c.refs,
    modeledOn: c.item,
    hookPatterns: c.hookPatterns,
    ownPerformance: c.ownPerformance,
  })

  const { data: script } = await supabaseAdmin
    .from('scripts')
    .insert({
      account_id: c.accountId,
      persona_id: c.persona.id,
      pillar_id: c.pillar?.id ?? null,
      funnel_stage: etapa,
      theme: null,
      duration: '60',
      source_library_item_id: c.item.id,
      output: g.output,
      model_used: g.model,
      tokens_in: g.tokensIn,
      tokens_out: g.tokensOut,
    })
    .select('id')
    .single()

  const d = await generateDelivery({
    persona: c.persona,
    stage: c.stage,
    promise: g.output.ctas.instagram.fala,
  })

  await supabaseAdmin.from('deliveries').insert({
    account_id: c.accountId,
    script_id: (script as { id: string } | null)?.id ?? null,
    library_item_id: c.item.id,
    slug: generateDeliverySlug(d.output.title),
    title: d.output.title,
    subtitle: d.output.subtitle ?? null,
    blocks: d.output.blocks,
    status: 'draft',
  })

  console.log(`── modelado em @${item.owner_handle} (${item.outlier?.toFixed(1)}×) · ${g.model}`)
  console.log(`   ${g.output.headline}`)
  console.log(`   gancho:  ${g.output.hooks[0]?.fala}`)
  console.log(`   CTA:     ${g.output.ctas.instagram.fala}`)
  console.log(`   entrega: "${d.output.title}" — ${d.output.blocks.length} blocos\n`)
}
