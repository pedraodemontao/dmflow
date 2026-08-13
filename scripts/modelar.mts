/**
 * Modela os vídeos que mais performaram: um roteiro novo para cada.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/modelar.mts [quantos]
 *
 * Sem tema, sem pilar, sem etapa: o vídeo de referência decide tudo — duração,
 * estrutura, tipo de gancho. O que muda é a voz. É só isso que esta ferramenta
 * precisa fazer.
 */
import { loadModelingContext } from '../src/lib/ai/context'
import { generateScript } from '../src/lib/ai/generate'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const quantos = Number(process.argv[2] ?? 3)

const { data } = await supabaseAdmin
  .from('library_items')
  .select('id, owner_handle, outlier, duration_sec')
  .not('analyzed_at', 'is', null)
  .neq('owner_handle', 'nocodepedro')
  .order('outlier', { ascending: false })
  .limit(quantos)

for (const item of (data ?? []) as Array<{
  id: string
  owner_handle: string
  /** `numeric` chega como string, e é NULO em perfil sem amostra para régua. */
  outlier: string | number | null
  duration_sec: number | null
}>) {
  const loaded = await loadModelingContext({ libraryItemId: item.id, funnelStage: 'meio', theme: null })
  if (!loaded.ok) { console.log(`✗ @${item.owner_handle}: ${loaded.problem}\n`); continue }
  const c = loaded.context

  const g = await generateScript({
    persona: c.persona, stage: c.stage, pillar: c.pillarName, theme: null,
    duration: String(item.duration_sec ?? 45),
    refs: c.refs, modeledOn: c.item, hookPatterns: c.hookPatterns,
    ownPerformance: c.ownPerformance,
  })

  await supabaseAdmin.from('scripts').insert({
    account_id: c.accountId, persona_id: c.persona.id, pillar_id: c.pillar?.id ?? null,
    funnel_stage: 'meio', theme: null, duration: String(item.duration_sec ?? 45),
    source_library_item_id: c.item.id, output: g.output, model_used: g.model,
    tokens_in: g.tokensIn, tokens_out: g.tokensOut,
  })

  // Perfil com menos de 6 vídeos medidos não tem mediana, então o item não tem
  // multiplicador — e "undefined×" no log parece defeito da geração quando é
  // ausência de régua. Ver `MIN_AMOSTRA` em `outlier.ts`.
  const regua = item.outlier === null ? 'sem régua' : `${Number(item.outlier).toFixed(1)}×`
  console.log(`── modelado em @${item.owner_handle} · ${item.duration_sec}s · ${regua}`)
  console.log(`   ${g.output.headline}`)
  for (const b of g.output.beats) console.log(`   [${b.beat}] ${b.fala}`)
  console.log(`   CTA: ${g.output.ctas.instagram.fala}\n`)
}
