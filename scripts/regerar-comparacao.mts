/**
 * Regera o roteiro do MESMO item de referência, para comparar com o anterior.
 * Uma vez só — cada execução é uma chamada paga.
 */
import { generateScript } from '../src/lib/ai/generate'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const { data: anterior } = await supabaseAdmin
  .from('scripts')
  .select('source_library_item_id, funnel_stage, persona_id, pillar_id')
  .order('created_at', { ascending: true })
  .limit(1)
  .single()

const a = anterior as { source_library_item_id: string; funnel_stage: string; persona_id: string }
const [{ data: item }, { data: persona }, { data: stages }] = await Promise.all([
  supabaseAdmin.from('library_items').select('*').eq('id', a.source_library_item_id).single(),
  supabaseAdmin.from('personas').select('*').eq('id', a.persona_id).single(),
  supabaseAdmin.from('funnel_stages').select('*').eq('persona_id', a.persona_id),
])

const stage = (stages ?? []).find((s: { key: string }) => s.key === a.funnel_stage) ?? (stages ?? [])[0]

const r = await generateScript({
  persona: persona as never,
  stage: stage as never,
  modeledOn: item as never,
})

console.log('MODELO:', r.model, '| in', r.tokensIn, '| out', r.tokensOut)
console.log(JSON.stringify(r.output, null, 2))
