import 'server-only'

import { fetchMedia, type Media } from '@/lib/instagram/api'
import { getAccount } from '@/lib/data'

/**
 * Busca os posts para o grid de seleção. Nunca lança: o editor precisa abrir
 * mesmo quando o Instagram está fora do ar ou o token venceu.
 */
export async function loadMedia(): Promise<{ media: Media[]; error: string | null }> {
  const account = await getAccount()
  if (!account) return { media: [], error: 'Nenhuma conta do Instagram conectada.' }

  try {
    const media = await fetchMedia({
      igUserId: account.ig_user_id,
      accessToken: account.access_token,
      limit: 50,
    })
    return { media, error: null }
  } catch (error) {
    return {
      media: [],
      error: error instanceof Error ? error.message : 'Erro ao carregar os posts',
    }
  }
}
