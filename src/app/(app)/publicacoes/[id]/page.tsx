import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { VideoFunnelCard, VideoMetrics } from '@/components/automacoes/video-insights'
import { Badge, Card } from '@/components/ui'
import { env } from '@/lib/env'
import { getLatestMediaInsight, getVideoFunnel } from '@/lib/instagram/video-funnel'
import { publicationMediaUrl } from '@/lib/publications/media-url'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Publication } from '@/types/db'

/**
 * O painel do post: o que a Meta mediu × o que o funil fez com isso.
 *
 * É o cruzamento que só nós temos (card 02): o Instagram sabe quantos viram;
 * só o dm-flow sabe quantos comentaram, viraram DM, clicaram e abriram o
 * presente. A tela é composição — `video-funnel.ts` e os componentes de
 * `video-insights.tsx` já existem para a tela de métricas da automação; aqui
 * eles são lidos pela porta do POST, que é como o dono pensa ("aquele post
 * valeu?"), não pela porta da automação.
 */

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<Publication['kind'], string> = {
  image: 'imagem',
  carousel: 'carrossel',
  reel: 'reel',
  story: 'story',
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export default async function PainelDoPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { data } = await supabaseAdmin.from('publications').select('*').eq('id', id).maybeSingle()
  const publication = (data as Publication | null) ?? null
  if (!publication) notFound()

  const flow = publication.flow_id
    ? ((
        await supabaseAdmin
          .from('flows')
          .select('id, name, delivery_id')
          .eq('id', publication.flow_id)
          .maybeSingle()
      ).data as { id: string; name: string; delivery_id: string | null } | null)
    : null

  const mediaId = publication.platform_media_id
  const insight = mediaId ? await getLatestMediaInsight(publication.account_id, mediaId) : null
  const funnel =
    mediaId && flow
      ? await getVideoFunnel({
          flowId: flow.id,
          mediaId,
          deliveryId: flow.delivery_id,
          views: insight?.views ?? null,
        })
      : []

  const coverPath = publication.cover_path ?? (publication.kind === 'reel' ? null : (publication.media_paths[0] ?? null))
  const coverUrl = coverPath ? publicationMediaUrl(coverPath, env.SUPABASE_URL) : null

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link
        href="/publicacoes"
        className="label mb-4 inline-flex items-center gap-1.5 text-[10px] text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Publicações
      </Link>

      <div className="mb-6 flex gap-4">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- capa do nosso bucket
          <img src={coverUrl} alt="" className="size-20 shrink-0 rounded-sm border border-border object-cover" />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={publication.status === 'published' ? 'success' : 'neutral'}>
              {publication.status === 'published' ? 'no ar' : publication.status}
            </Badge>
            <span className="label text-[9px] text-muted">
              {KIND_LABEL[publication.kind]}
              {publication.published_at && ` · publicado ${fmt.format(new Date(publication.published_at))}`}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-snug">{publication.caption || 'sem legenda'}</p>
          <div className="label mt-2 flex flex-wrap gap-3 text-[10px] text-muted">
            {publication.permalink && (
              <a href={publication.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                abrir no Instagram <ExternalLink className="size-3" />
              </a>
            )}
            {flow && <span>automação: <span className="text-foreground">{flow.name}</span></span>}
          </div>
        </div>
      </div>

      {publication.status !== 'published' ? (
        <Card className="p-5 text-[11px] text-muted">
          Métrica nasce com o post no ar. Enquanto isso, o que existe é o estado da fila — está na
          lista de publicações.
        </Card>
      ) : (
        <div className="space-y-4">
          <VideoMetrics insight={insight} />
          {flow ? (
            <VideoFunnelCard steps={funnel} hasViews={insight?.views != null} />
          ) : (
            <Card className="p-5 text-[11px] text-muted">
              Este post saiu sem automação vinculada, então não há funil para cruzar — só os números
              da Meta acima. Post com automação mostra aqui: viram → comentaram → viraram DM →
              clicaram → abriram o presente.
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
