/** Traz os posts da própria conta para a biblioteca — o laço do aprendizado. */
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
}
