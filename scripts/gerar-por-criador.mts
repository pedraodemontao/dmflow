/**
 * Um roteiro do MELHOR vídeo de cada criador, cada um num pilar diferente.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/gerar-por-criador.mts
 *
 * O PILAR É O REMÉDIO CONTRA O ROTEIRO GENÉRICO. Sem tema, o prompt diz
 * "(livre, escolha o ângulo mais forte do pilar)" e o modelo pega o tema DO
 * VÍDEO DE REFERÊNCIA — foi assim que três roteiros seguidos saíram todos
 * sobre Claude Code. Copiar o assunto não é modelar; modelar é aplicar a
 * estrutura que funcionou a um assunto que é do dono.
 */
import { loadModelingContext } from '../src/lib/ai/context'
import { generateScript } from '../src/lib/ai/generate'
import { generateDelivery } from '../src/lib/ai/generate-delivery'
import { generateDeliverySlug } from '../src/lib/ai/slug'
import { supabaseAdmin } from '../src/lib/supabase/admin'
import type { FunnelStageKey } from '../src/types/db'

/** Cada criador com o pilar cuja NATUREZA casa com a estrutura do vídeo dele. */
const PARES = [
  { handle: 'maxcarrau.ia', pilar: 'Ferramenta de IA', etapa: 'topo' },
  { handle: 'rafa.grandi', pilar: 'Criar produto com IA', etapa: 'meio' },
  { handle: 'brunobelissimo.ai', pilar: 'Notícia / tendência', etapa: 'topo' },
  { handle: 'dfolloni', pilar: 'Claude Code / Vibe Coding', etapa: 'meio' },
] as const

const { data: pilares } = await supabaseAdmin.from('content_pillars').select('id, name')
const idDoPilar = new Map(
  ((pilares ?? []) as Array<{ id: string; name: string }>).map((p) => [p.name, p.id]),
)

for (const par of PARES) {
  const { data: itens } = await supabaseAdmin
    .from('library_items')
    .select('id, outlier')
    .eq('owner_handle', par.handle)
    .not('analyzed_at', 'is', null)
    .order('outlier', { ascending: false })
    .limit(1)

  const item = (itens ?? [])[0] as { id: string; outlier: number } | undefined
  if (!item) {
    console.log(`✗ @${par.handle}: nenhum vídeo analisado\n`)
    continue
  }

  const loaded = await loadModelingContext({
    libraryItemId: item.id,
    funnelStage: par.etapa as FunnelStageKey,
    pillarId: idDoPilar.get(par.pilar),
    theme: null,
  })
  if (!loaded.ok) {
    console.log(`✗ @${par.handle}: ${loaded.problem}\n`)
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
      funnel_stage: par.etapa,
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

  console.log(`── @${par.handle} (${item.outlier?.toFixed(1)}×) · pilar: ${c.pillarName}`)
  console.log(`   ${g.output.headline}`)
  console.log(`   GANCHO 1: ${g.output.hooks[0]?.fala}`)
  console.log(`   GANCHO 2: ${g.output.hooks[1]?.fala}`)
  console.log(`   1º beat:  ${g.output.beats[0]?.fala?.slice(0, 130)}`)
  console.log(`   CTA:      ${g.output.ctas.instagram.fala}\n`)
}
