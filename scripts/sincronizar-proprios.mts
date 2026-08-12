/**
 * Traz os posts da própria conta para a biblioteca — o laço do aprendizado.
 *
 *   npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/sincronizar-proprios.mts
 *
 * Três passos, nesta ordem, porque cada um depende do anterior: a Graph API dá
 * o conteúdo (`/me/media`), `media_insights` dá o número, e só com número há
 * mediana e multiplicador. Rodar só o primeiro deixa o acervo do dono na
 * tabela e fora de toda ordenação — que foi o estado até 12/08/2026.
 */
import { recomputeProfileMetrics } from '../src/lib/library/ingest'
import { syncOwnPlaysFromInsights } from '../src/lib/library/own-plays'
import { syncOwnMedia } from '../src/lib/library/sync-own'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const { data } = await supabaseAdmin
  .from('accounts')
  .select('id, ig_user_id, username, access_token')
  .eq('is_active', true)

for (const acc of (data ?? []) as Array<{
  id: string
  ig_user_id: string
  username: string
  access_token: string
}>) {
  const r = await syncOwnMedia({
    accountId: acc.id,
    igUserId: acc.ig_user_id,
    username: acc.username,
    accessToken: acc.access_token,
    limit: 50,
  })
  console.log(`@${acc.username}: ${r.found} vídeos · ${r.inserted} novos · ${r.updated} atualizados`)

  const plays = await syncOwnPlaysFromInsights(acc.id)
  console.log(
    `   número: ${plays.atualizados} atualizados de ${plays.vinculados} vinculados · ${plays.semInsight} ainda sem insight`,
  )

  if (plays.perfis.length > 0) {
    const metrics = await recomputeProfileMetrics({ accountId: acc.id, profileIds: plays.perfis })
    console.log(
      `   régua: ${metrics.profiles} perfil(is) · ${metrics.items} multiplicadores${
        metrics.errors.length ? ` · erros: ${metrics.errors.join('; ')}` : ''
      }`,
    )
  }
}
