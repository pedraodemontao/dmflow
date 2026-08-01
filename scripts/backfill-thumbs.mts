/**
 * Guarda cópia nossa das capas que ainda apontam para o CDN do Instagram.
 *
 * Existe como script porque é operação de uma vez só sobre o que já foi
 * raspado antes de `thumbs.ts` existir. Raspagem nova já guarda sozinha.
 */
import { backfillThumbs } from '../src/lib/library/thumbs'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const { data } = await supabaseAdmin.from('accounts').select('id').limit(1).single()
if (!data) throw new Error('Nenhuma conta conectada.')

const results = await backfillThumbs({
  accountId: (data as { id: string }).id,
  supabaseUrl: process.env.SUPABASE_URL ?? '',
})

const ok = results.filter((r) => r.ok).length
console.log(`capas guardadas: ${ok} de ${results.length}`)
for (const f of results.filter((r) => !r.ok)) console.log('  falhou:', f.itemId, f.reason)
