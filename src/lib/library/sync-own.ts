import { fetchMedia } from '@/lib/instagram/api'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Os posts do PRÓPRIO dono entram na biblioteca.
 *
 * POR QUE ISTO MUDA O SISTEMA: até aqui a biblioteca só olhava o conteúdo dos
 * outros. O gerador modelava @maxcarrau e ignorava que o vídeo DELE de 40s com
 * gancho de contradição converteu três vezes mais que o de 70s explicativo —
 * ou seja, o sistema aprendia com estranhos e esquecia a própria experiência.
 *
 * E o dado próprio é estritamente melhor que o alheio, por um motivo que
 * nenhuma raspagem resolve: nos posts dos outros sabemos o que aconteceu ATÉ o
 * play. Nos nossos sabemos o que aconteceu DEPOIS — quantos comentaram,
 * viraram DM, clicaram, seguiram, abriram o presente. É a diferença entre
 * "esse vídeo teve alcance" e "esse vídeo trouxe gente".
 *
 * DECISÃO DE MODELAGEM: o próprio perfil vira uma linha em `tracked_profiles`
 * com `is_active = false`. Assim a mediana, o multiplicador de outlier e a
 * análise por IA funcionam nos posts do dono pelo mesmo caminho que já
 * funciona para os de fora — sem tabela nova, sem migration, sem um segundo
 * conjunto de regras para manter em pé.
 *
 * O `is_active = false` é o que impede a Apify de raspar o que já temos de
 * graça: para o próprio perfil existe a Graph API, que além de não custar nada
 * ainda devolve o que a Apify jamais devolveria — os insights.
 */

/** Só reels e vídeos: carrossel e foto não competem na mesma régua de plays. */
const TIPOS = new Set(['VIDEO', 'REELS'])

export interface SyncOwnResult {
  profileId: string
  found: number
  inserted: number
  updated: number
}

/**
 * Garante a linha do próprio perfil em `tracked_profiles`.
 * Idempotente: rodar de novo devolve a mesma linha.
 */
async function ownProfile(accountId: string, username: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('tracked_profiles')
    .select('id')
    .eq('account_id', accountId)
    .eq('username', username)
    .maybeSingle()

  if (existing) return (existing as { id: string }).id

  const { data, error } = await supabaseAdmin
    .from('tracked_profiles')
    .insert({
      account_id: accountId,
      username,
      category: 'próprio',
      // Desligado para a Apify. Ver o cabeçalho: o que ela cobraria, a Graph
      // API entrega de graça e com mais campos.
      is_active: false,
    })
    .select('id')
    .single()

  if (error) throw new Error(`perfil próprio não criado: ${error.message}`)
  return (data as { id: string }).id
}

/**
 * Traz os posts recentes da conta para `library_items`.
 *
 * `views` e `plays` ficam em zero aqui de propósito: eles não vêm de
 * `/me/media`, vêm de `media_insights`, que é coletado pelo tick. Preencher
 * com o `like_count` "só para não ficar zerado" contaminaria a mediana do
 * perfil — e mediana errada é régua errada para todo mundo (ver HANDOFF §4.9).
 */
export async function syncOwnMedia(args: {
  accountId: string
  igUserId: string
  username: string
  accessToken: string
  limit?: number
}): Promise<SyncOwnResult> {
  const profileId = await ownProfile(args.accountId, args.username)
  const media = await fetchMedia({
    igUserId: args.igUserId,
    accessToken: args.accessToken,
    limit: args.limit ?? 25,
  })

  const videos = media.filter((item) => TIPOS.has(item.media_type ?? ''))
  if (videos.length === 0) return { profileId, found: 0, inserted: 0, updated: 0 }

  const { data: existentes } = await supabaseAdmin
    .from('library_items')
    .select('id, external_url')
    .eq('profile_id', profileId)

  const porUrl = new Map(
    ((existentes ?? []) as Array<{ id: string; external_url: string }>).map((row) => [
      row.external_url,
      row.id,
    ]),
  )

  let inserted = 0
  let updated = 0
  const scrapedAt = new Date().toISOString()

  for (const item of videos) {
    const url = item.permalink
    if (!url) continue

    const row = {
      account_id: args.accountId,
      profile_id: profileId,
      source: 'instagram' as const,
      owner_handle: args.username,
      category: 'próprio',
      post_type: item.media_type ?? 'VIDEO',
      external_url: url,
      // A chave que liga este item a `media_insights`. Só aqui os dois valores
      // chegam juntos: a Graph API devolve id e permalink na mesma resposta.
      platform_media_id: item.id,
      thumb_url: item.thumbnail_url ?? item.media_url ?? null,
      caption: item.caption?.trim() ?? '',
      posted_at: item.timestamp ?? null,
      comments: item.comments_count ?? 0,
      likes: item.like_count ?? 0,
      scraped_at: scrapedAt,
    }

    const existente = porUrl.get(url)
    if (existente) {
      // `caption` e `posted_at` ficam de fora do update: são imutáveis no
      // Instagram depois de publicado, e reescrevê-los só gastaria escrita.
      const { error } = await supabaseAdmin
        .from('library_items')
        .update({
          platform_media_id: item.id,
          comments: row.comments,
          likes: row.likes,
          thumb_url: row.thumb_url,
          scraped_at: scrapedAt,
        })
        .eq('id', existente)
      if (!error) updated += 1
    } else {
      const { error } = await supabaseAdmin.from('library_items').insert(row)
      if (!error) inserted += 1
    }
  }

  return { profileId, found: videos.length, inserted, updated }
}
