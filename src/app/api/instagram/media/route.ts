import { fetchMedia } from '@/lib/instagram/api'
import { getAccount } from '@/lib/data'

export const dynamic = 'force-dynamic'

/** Alimenta o grid de seleção de posts do builder. */
export async function GET() {
  const account = await getAccount()
  if (!account) return Response.json({ error: 'Nenhuma conta conectada' }, { status: 400 })

  try {
    const media = await fetchMedia({
      igUserId: account.ig_user_id,
      accessToken: account.access_token,
      limit: 50,
    })
    return Response.json({ media })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar mídia'
    return Response.json({ error: message }, { status: 502 })
  }
}
