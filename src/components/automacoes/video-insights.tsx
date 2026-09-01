import Link from 'next/link'
import { Film, Trophy } from 'lucide-react'

import { Card, EmptyState } from '@/components/ui'
import { RankBars, type RankItem } from '@/components/ui/chart'
import type { FunnelStepWithDrop, VideoRankingRow } from '@/lib/instagram/video-funnel'
import type { MediaInsight } from '@/types/db'

/**
 * Bloco 1/2/3 do card 02: o que o vídeo fez (dado da Meta), o que a
 * automação fez com isso (o funil que só nós temos) e o comparativo entre
 * posts. Primitivos de `components/ui/chart.tsx` — nenhum gráfico novo.
 */

const SEM_DADO = '—'
/**
 * Confirmado por curl contra a conta real em 01/08/2026: 100% do conteúdo
 * desta conta é REELS, e REELS recusa estas três (a Meta nem manda o campo).
 * "sem dado para Reels" é mais honesto que "—": diz POR QUE falta, não só que falta.
 */
const REELS_SEM_DADO = new Set(['follows', 'profile_visits', 'link_clicks'])

const COMPACT = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function compact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return SEM_DADO
  if (Math.abs(value) < 1000) return String(Math.round(value))
  return COMPACT.format(value)
}

function statText(key: string, value: number | null | undefined, mediaKind: 'video' | 'static' = 'video'): string {
  // "sem dado para Reels" só faz sentido em Reel — num carrossel a métrica
  // simplesmente não existe, e o rótulo errado aponta o dono pro lugar errado.
  if (value == null) return mediaKind === 'video' && REELS_SEM_DADO.has(key) ? 'sem dado para Reels' : SEM_DADO
  return compact(value)
}

function seconds(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return SEM_DADO
  return `${(ms / 1000).toFixed(1).replace('.', ',')}s`
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return SEM_DADO
  return `${value.toFixed(1).replace('.', ',')}%`
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const semDado = value === SEM_DADO || value === 'sem dado para Reels'
  return (
    <div className="rounded-md border border-border p-3" title={hint}>
      <p className="label text-[9px] text-muted">{label}</p>
      <p className={`display mt-1 tabular-nums ${semDado ? 'text-sm text-muted' : 'text-2xl'}`}>
        {value}
      </p>
    </div>
  )
}

/** Bloco 1 — o que o vídeo fez, direto da Meta. */
export function VideoMetrics({
  insight,
  mediaKind = 'video',
}: {
  insight: MediaInsight | null
  /** 'static' (imagem/carrossel) esconde as métricas que só vídeo tem. */
  mediaKind?: 'video' | 'static'
}) {
  if (!insight) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={<Film className="size-8" />}
          title="Sem insights coletados ainda"
          description="A coleta roda no cron, uma vez por mídia por hora. Se a automação acabou de ligar ou o Instagram acabou de reconectar, aguarde o próximo tick — ou confirme que a reconexão trouxe o escopo de insights."
        />
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <p className="label text-[10px] text-muted">{mediaKind === 'video' ? 'O que o vídeo fez' : 'O que o post fez'}</p>
      {mediaKind === 'video' && (
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Direto da Meta. Retenção aqui é MÉDIA — a curva segundo a segundo só existe dentro do
          próprio app do Instagram, nenhuma API entrega isso.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="visualizações" value={statText('views', insight.views, mediaKind)} />
        <Stat label="contas alcançadas" value={statText('reach', insight.reach, mediaKind)} />
        <Stat
          label="seguidores trazidos"
          value={statText('follows', insight.follows, mediaKind)}
          hint={mediaKind === 'video' ? 'Quantos passaram a seguir a conta por causa deste vídeo.' : 'Quantos passaram a seguir a conta por causa deste post.'}
        />
        <Stat label="visitas ao perfil" value={statText('profile_visits', insight.profile_visits, mediaKind)} />
        <Stat label="cliques em link" value={statText('link_clicks', insight.link_clicks, mediaKind)} />
        {mediaKind === 'video' && (
          <Stat
            label="tempo médio assistido"
            value={seconds(insight.avg_watch_time_ms)}
            hint="Média de quanto tempo cada visualização durou."
          />
        )}
        {mediaKind === 'video' && (
          <Stat
            label="taxa de pulo"
            value={pct(insight.skip_rate)}
            hint="% de visualizações que pularam o reel nos 3 primeiros segundos."
          />
        )}
        <Stat label="salvamentos" value={statText('saved', insight.saved, mediaKind)} />
        <Stat label="compartilhamentos" value={statText('shares', insight.shares, mediaKind)} />
      </div>

      <p className="mt-3 text-[10px] text-muted">
        Coletado em {new Date(insight.captured_at).toLocaleString('pt-BR')}
      </p>
    </Card>
  )
}

/** Bloco 2 — o funil que só a gente tem: da view até o presente aberto. */
export function VideoFunnelCard({
  steps,
  hasViews,
}: {
  steps: FunnelStepWithDrop[]
  /** Falso quando não há coleta ainda — "viram" é 0 por falta de dado, não porque ninguém viu. */
  hasViews: boolean
}) {
  if (steps.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={<Film className="size-8" />}
          title="Sem funil ainda"
          description="Assim que alguém interagir com este post, cada degrau — comentou, virou DM, clicou, seguiu — aparece aqui."
        />
      </Card>
    )
  }

  const items: RankItem[] = steps.map((step) => {
    const isViews = step.key === 'viram'
    const valueLabel =
      isViews && !hasViews ? (
        <span className="text-muted">sem coleta</span>
      ) : (
        <span className="flex items-baseline gap-1.5">
          {compact(step.value)}
          {step.dropPct != null && (
            <span className={step.dropPct >= 0 ? 'text-warning' : 'text-success'}>
              {step.dropPct >= 0 ? `−${step.dropPct}%` : `+${Math.abs(step.dropPct)}%`}
            </span>
          )}
        </span>
      )

    return {
      id: step.key,
      label: step.label,
      value: step.value,
      valueLabel,
      tone: isViews ? 'accent' : 'ink',
    }
  })

  // Só queda de verdade concorre aqui — degrau que CRESCE (dropPct negativo)
  // não é perda, e "−-20%" na tela seria um duplo-negativo ilegível.
  const worst = steps.reduce<FunnelStepWithDrop | null>((acc, step) => {
    if (step.dropPct == null || step.dropPct <= 0) return acc
    if (!acc || step.dropPct > acc.dropPct!) return step
    return acc
  }, null)

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-4">
        <p className="label text-[10px] text-muted">O que a automação fez com isso</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Cada degrau com a queda em % contra o anterior — o degrau que mais perde é o que vale
          consertar primeiro.
        </p>
      </div>

      <RankBars className="px-4" items={items} />

      {worst && (
        <p className="border-t border-border p-4 text-xs leading-relaxed text-muted">
          Maior queda em <span className="text-foreground">{worst.label}</span>:{' '}
          <span className="text-warning tabular-nums">−{worst.dropPct}%</span> em relação ao
          degrau anterior.
        </p>
      )}
    </Card>
  )
}

export type RankingSort = 'seguidores' | 'comentario_dm' | 'view_seguidor'

const SORT_LABEL: Record<RankingSort, string> = {
  seguidores: 'seguidores trazidos',
  comentario_dm: 'conversão comentário → DM',
  view_seguidor: 'conversão view → seguidor',
}

function rankingValue(row: VideoRankingRow, sort: RankingSort): number | null {
  if (sort === 'seguidores') return row.follows
  if (sort === 'comentario_dm') return row.conversaoComentarioDM
  return row.conversaoViewSeguidor
}

function rankingValueLabel(row: VideoRankingRow, sort: RankingSort): string {
  if (sort === 'seguidores') return compact(row.follows)
  const value = rankingValue(row, sort)
  return value == null ? SEM_DADO : `${value}%`
}

/** Bloco 3 — comparativo entre os posts com automação. Ordem via ?ordenar= (sem JS de cliente). */
export function VideoRanking({
  rows,
  sort,
  basePath,
}: {
  rows: VideoRankingRow[]
  sort: RankingSort
  basePath: string
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={<Trophy className="size-8" />}
          title="Nenhum vídeo com automação ainda"
          description="Assim que um post tiver um gatilho de comentário vinculado, ele entra neste ranking."
        />
      </Card>
    )
  }

  const sorted = [...rows]
    .filter((row) => rankingValue(row, sort) != null)
    .sort((a, b) => (rankingValue(b, sort) ?? 0) - (rankingValue(a, sort) ?? 0))

  const items: RankItem[] = sorted.map((row) => ({
    id: row.automationId,
    value: rankingValue(row, sort) ?? 0,
    valueLabel: rankingValueLabel(row, sort),
    label: (
      <Link href={`/automacoes/${row.automationId}/metricas`} className="hover:underline">
        {row.flowName}
      </Link>
    ),
  }))

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-4">
        <p className="label text-[10px] text-muted">Comparativo entre posts</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(SORT_LABEL) as RankingSort[]).map((option) => (
            <Link
              key={option}
              href={`${basePath}?ordenar=${option}`}
              className={`label rounded-full border px-2.5 py-1 text-[9px] ${
                option === sort
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {SORT_LABEL[option]}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="p-4 text-xs text-muted">
          Nenhum post ainda tem dado suficiente para ordenar por {SORT_LABEL[sort]}.
        </p>
      ) : (
        <RankBars className="px-4" items={items} />
      )}
    </Card>
  )
}
