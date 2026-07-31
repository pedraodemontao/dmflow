'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { ArrowUpRight, Check, Eye, Heart, MessageCircle, Play } from 'lucide-react'

import { setLibraryItemWatched } from '@/app/(app)/biblioteca/actions'
import type { LibraryCardItem } from '@/app/(app)/biblioteca/queries'
import { getInitials } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

import { compact, duration, humanize, outlierLabel, percent, shortDate } from './format'

/**
 * O card de um conteúdo de referência.
 *
 * Diferença deliberada em relação ao projeto de origem: lá o texto fica POR
 * CIMA da miniatura, sobre um gradiente preto. Aqui a miniatura é uma placa e
 * todo o dado vive embaixo dela, na superfície do card. O motivo é contraste:
 * texto sobre imagem arbitrária não tem razão de manter 4,5:1 — a mesma
 * legenda que se lê num frame escuro some num frame claro. Sobre `surface` o
 * contraste é o mesmo do resto do app, e de quebra o card fica com a silhueta
 * de canto duro e fio de cabelo que esta direção usa, em vez do cartão
 * flutuante com gradiente.
 */

export function LibraryCard({ item }: { item: LibraryCardItem }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [watched, setWatched] = useState(item.watched)

  const handle = item.owner_handle ? `@${item.owner_handle}` : 'sem autor'
  const formato = humanize(item.visual_format)
  const data = shortDate(item.posted_at)
  // O gancho é o que faz o vídeo ser modelável; a legenda é o consolo quando o
  // enriquecimento por IA ainda não passou por este item.
  const resumo = item.hook_text?.trim() || item.caption.trim()

  function toggleWatched() {
    const next = !watched
    setWatched(next)

    start(async () => {
      const result = await setLibraryItemWatched(item.id, next)
      if (!result.ok) {
        setWatched(!next)
        toast.error(result.error ?? 'Não consegui marcar este conteúdo.')
        return
      }
      router.refresh()
    })
  }

  return (
    // Sem `<Card>`/`.surface-panel` aqui de propósito: aquelas regras não vivem
    // em `@layer`, então venceriam o `hover:border-*` desta linha e o card
    // ficaria sem resposta ao cursor (a armadilha do Tailwind 4 documentada em
    // globals.css). Com as classes soltas, o hover pinta.
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-border bg-surface transition-colors duration-150',
        'focus-within:border-muted hover:border-muted',
      )}
    >
      <Thumb item={item} handle={handle} watched={watched} />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{handle}</p>
            <p className="label mt-1 truncate text-[9px] text-muted">
              {[item.category, formato, data].filter(Boolean).join(' · ') || 'sem classificação'}
            </p>
          </div>

          {/* Só o sinal de que o card leva para fora — "a capa é um link" não é
              óbvio sozinho. O link de verdade é a miniatura inteira, e este
              ícone fica mudo e fora da tabulação de propósito: dois caminhos
              para o mesmo destino viram duas paradas de teclado e o mesmo
              rótulo anunciado duas vezes por card, o que numa grade de 300 é
              ruído puro. */}
          <span aria-hidden="true" className="shrink-0 p-1 text-muted">
            <ArrowUpRight className="size-4" />
          </span>
        </div>

        {resumo && (
          <p className="line-clamp-3 text-xs leading-relaxed text-foreground/90">{resumo}</p>
        )}

        <dl className="label mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[10px] text-muted tabular-nums">
          <Metric icon={<Play className="size-3" />} label="plays" value={compact(item.plays)} />
          <Metric icon={<Heart className="size-3" />} label="curtidas" value={compact(item.likes)} />
          <Metric
            icon={<MessageCircle className="size-3" />}
            label="comentários"
            value={compact(item.comments)}
          />
          <div className="ml-auto">
            <dt className="sr-only">engajamento</dt>
            <dd>
              <span className="text-foreground">{percent(item.engagementRate)}</span>{' '}
              <span aria-hidden="true">eng</span>
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={toggleWatched}
          disabled={pending}
          aria-pressed={watched}
          className={cn(
            'label flex h-8 items-center justify-center gap-1.5 rounded-md border text-[9.5px] transition-colors duration-150',
            'disabled:cursor-not-allowed disabled:opacity-45',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            watched
              ? 'border-border bg-surface-2 text-muted hover:text-foreground'
              : 'border-border bg-surface-2 text-foreground hover:border-foreground',
          )}
        >
          {watched ? <Check className="size-3.5" /> : <Eye className="size-3.5" />}
          {watched ? 'assistido' : 'marcar assistido'}
        </button>
      </div>
    </article>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-center gap-1">
        <span className="shrink-0 text-muted" aria-hidden="true">
          {icon}
        </span>
        <span className="text-foreground">{value}</span>
      </dd>
    </div>
  )
}

/**
 * A miniatura vem de URL ASSINADA QUE EXPIRA (migration 0014, mesma lição da
 * foto de perfil na 0012). Duas defesas, e a segunda é a que importa:
 *
 *   1. O próprio `<img>` observa o erro de carregamento — não dá para confiar
 *      que algo revalidou a URL a tempo no servidor.
 *   2. O que entra no lugar é uma PLACA DESENHADA, não um buraco: monograma do
 *      autor em display, moldura de fio e um rótulo que diz o que houve. Card
 *      com retângulo cinza vazio lê como bug e faz o dono desconfiar da tela
 *      inteira; placa com o @ dentro lê como "esta capa não está disponível" e
 *      o card continua servindo para o que existe (métrica, gancho, link).
 */
function Thumb({
  item,
  handle,
  watched,
}: {
  item: LibraryCardItem
  handle: string
  watched: boolean
}) {
  const [broken, setBroken] = useState(false)
  const outlier = outlierLabel(item.outlier)
  const tempo = duration(item.duration_sec)
  const showImage = Boolean(item.thumb_url) && !broken

  return (
    <a
      href={item.external_url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Abrir a publicação de ${handle} no Instagram`}
      className="relative block aspect-[4/5] shrink-0 overflow-hidden border-b border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumb_url ?? undefined}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          // Já assistido esmaece a CAPA, nunca o texto: imagem não tem piso de
          // contraste, rótulo tem. É o mesmo vocabulário de e-mail lido — na
          // varredura da grade, o que o dono já olhou recua sem sumir.
          className={cn('size-full object-cover', watched && 'opacity-50')}
        />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <span className="absolute inset-2 border border-border" aria-hidden="true" />
          <span className="display text-4xl text-muted" aria-hidden="true">
            {getInitials(handle)}
          </span>
          <span className="label text-[8.5px] text-muted">capa indisponível</span>
        </span>
      )}

      <span className="absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
        <OutlierChip label={outlier} />
        {tempo && (
          // Chip OPACO, não translúcido: sobre uma capa clara, preto a 85%
          // derruba o rótulo cinza para ~4,2:1 e o texto some justamente na
          // miniatura mais brilhante. Fora que vidro não faz parte desta
          // gramática — o chip é uma plaquinha colada, com fio e canto duro.
          <span className="label rounded-sm border border-border bg-background px-1.5 py-0.5 text-[9px] text-foreground tabular-nums">
            {tempo}
          </span>
        )}
      </span>
    </a>
  )
}

/**
 * O multiplicador tem TRÊS estados, não dois — e o terceiro é o que exige
 * cuidado. Perfil com amostra curta demais não tem régua, e "sem régua"
 * precisa parecer uma medida que falta, não uma nota baixa. Por isso o chip
 * vazio usa a mesma caixa neutra do multiplicador comum (não um vermelho, não
 * um zero) e carrega a explicação no `title`.
 */
function OutlierChip({ label }: { label: ReturnType<typeof outlierLabel> }) {
  return (
    <span
      title={label.title}
      className={cn(
        'label rounded-sm border px-1.5 py-0.5 text-[9px] tabular-nums',
        label.state === 'destaque'
          ? // A única cor viva do card. Limão sólido com tinta preta (~16:1) —
            // seleção, no vocabulário da direção "Marcador".
            'border-accent bg-accent font-medium text-background'
          : // Opaco pelo mesmo motivo do chip de duração: sobre capa clara o
            // fundo translúcido levaria o cinza para baixo de 4,5:1.
            'border-border bg-background text-muted',
      )}
    >
      {label.text}
    </span>
  )
}
