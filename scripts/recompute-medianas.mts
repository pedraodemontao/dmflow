/** Recalcula mediana e outlier de todos os perfis. Uma vez só, depois do bug do bigint. */
import { recomputeProfileMetrics } from '../src/lib/library/ingest'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const { data: acc } = await supabaseAdmin.from('accounts').select('id').limit(1).single()
const { data: perfis } = await supabaseAdmin.from('tracked_profiles').select('id')
const r = await recomputeProfileMetrics({
  accountId: (acc as { id: string }).id,
  profileIds: ((perfis ?? []) as Array<{ id: string }>).map((p) => p.id),
})
console.log('erros:', r.errors.length ? r.errors : 'nenhum')
