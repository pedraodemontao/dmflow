/** Roda a raspagem fora da tela para ler o relatório inteiro. */
import { runLibraryScrape } from '../src/lib/library/scrape'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const { data } = await supabaseAdmin.from('accounts').select('id').limit(1).single()
const report = await runLibraryScrape({ accountId: (data as { id: string }).id })
console.log(JSON.stringify(report, null, 2))
