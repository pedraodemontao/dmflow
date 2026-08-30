import 'server-only'

import { env } from '@/lib/env'
import { publicationMediaUrl } from '@/lib/publications/media-url'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Publication, PublicationKind, PublicationStatus } from '@/types/db'

/**
 * Leitura de publicações para a lista. Mesma ressalva das queries da
 * biblioteca: o lugar definitivo seria `src/lib/data.ts`, mas nasce aqui para
 * não disputar linha com quem estiver editando aquele arquivo.
 */

export interface PublicationListItem {
  id: string
  kind: PublicationKind
  caption: string
  status: PublicationStatus
  scheduledAt: string | null
  publishedAt: string | null
  permalink: string | null
  error: string | null
  attempts: number
  /** Capa (ou primeira mídia) como URL pública. Reel sem capa não tem prévia. */
  coverUrl: string | null
  mediaCount: number
  flowName: string | null
  createdAt: string
}

export async function getPublications(): Promise<PublicationListItem[]> {
  const { data, error } = await supabaseAdmin
    .from('publications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[dm-flow] publicações indisponíveis:', error.message)
    return []
  }

  const rows = (data ?? []) as Publication[]
  if (rows.length === 0) return []

  const flowIds = Array.from(new Set(rows.map((r) => r.flow_id).filter((id): id is string => id !== null)))
  const flowName = new Map<string, string>()
  if (flowIds.length > 0) {
    const { data: flows } = await supabaseAdmin.from('flows').select('id, name').in('id', flowIds)
    for (const flow of (flows ?? []) as Array<{ id: string; name: string }>) flowName.set(flow.id, flow.name)
  }

  const supabaseUrl = env.SUPABASE_URL

  return rows.map((row) => {
    const coverPath = row.cover_path ?? (row.kind === 'reel' ? null : (row.media_paths[0] ?? null))
    return {
      id: row.id,
      kind: row.kind,
      caption: row.caption,
      status: row.status,
      scheduledAt: row.scheduled_at,
      publishedAt: row.published_at,
      permalink: row.permalink,
      error: row.error,
      attempts: row.attempts,
      coverUrl: coverPath ? publicationMediaUrl(coverPath, supabaseUrl) : null,
      mediaCount: row.media_paths.length,
      flowName: row.flow_id ? (flowName.get(row.flow_id) ?? null) : null,
      createdAt: row.created_at,
    }
  })
}
