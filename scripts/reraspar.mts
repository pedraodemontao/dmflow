/** Re-raspa os perfis para trazer os campos novos (comentários, hashtags, publi, proporção). */
import { runLibraryScrape } from '../src/lib/library/scrape'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const { data: acc } = await supabaseAdmin.from('accounts').select('id').limit(1).single()
const accountId = (acc as { id: string }).id

// Zera o carimbo: sem isso a raspagem pula quem já foi visto dentro da janela.
await supabaseAdmin.from('tracked_profiles').update({ last_scraped_at: null }).eq('account_id', accountId)

for (let volta = 1; volta <= 6; volta += 1) {
  // Orçamento longo: fora da Vercel não há teto de 300s, e esperar a Apify
  // numa chamada só evita o vaivém de "clique de novo para colher".
  const r = await runLibraryScrape({ accountId, budgetMs: 240_000 })
  console.log(
    `volta ${volta}: ${r.phase} · recebidos ${r.received} · novos ${r.inserted} · atualizados ${r.updated} · US$ ${r.costUsd.toFixed(3)} · faltam ${r.profilesRemaining}`,
  )
  if (r.errors?.length) console.log('  erros:', r.errors.slice(0, 3))
  if (r.phase === 'concluida' && r.profilesRemaining === 0) break
}
