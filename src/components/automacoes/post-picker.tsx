'use client'

import { useState, useTransition } from 'react'
import { Check, Globe, Heart, Images, MessageCircle, Play, RefreshCw } from 'lucide-react'

import type { Media } from '@/lib/instagram/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

/**
 * Os posts chegam prontos do servidor (fetch em Server Component). O botão
 * atualizar só refaz a busca sob demanda.
 */
export function PostPicker({
  media: initialMedia,
  loadError,
  selectedId,
  onSelect,
}: {
  media: Media[]
  loadError?: string | null
  selectedId: string | null
  onSelect: (mediaId: string | null) => void
}) {
  const [media, setMedia] = useState<Media[]>(initialMedia)
  const [error, setError] = useState<string | null>(loadError ?? null)
  const [loading, startTransition] = useTransition()

  function load() {
    startTransition(async () => {
      setError(null)
      try {
        const res = await fetch('/api/instagram/media')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Falha ao carregar')
        setMedia(json.media ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar posts')
      }
    })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="label text-[10px] text-muted">
          {loading ? 'Atualizando…' : `${media.length} posts encontrados`}
        </p>
        <Button variant="ghost" size="sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {error && (
        <p className="mb-3 rounded-sm border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {/* Qualquer post: o gatilho vale para a conta inteira. Sem imagem por
            baixo, então aqui a seleção pode preencher de limão como no canvas. */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex aspect-square flex-col items-center justify-center gap-2 rounded-sm border border-dashed p-4 text-center transition-colors',
            selectedId === null
              ? 'border-accent bg-accent text-background'
              : 'border-border hover:border-muted',
          )}
        >
          <Globe className={cn('size-6', selectedId === null ? 'text-background' : 'text-muted')} />
          <span className="label text-[10px]">Qualquer post</span>
          <span
            className={cn(
              'text-[11px] leading-tight',
              selectedId === null ? 'text-background/80' : 'text-muted',
            )}
          >
            Vale para todos os posts e reels
          </span>
        </button>

        {media.map((item) => {
          const thumb = item.thumbnail_url ?? item.media_url
          const selected = selectedId === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                // A miniatura é imprevisível — pode ser branca, saturada, ou
                // ter a mesma cor de qualquer estado que eu escolhesse. Por
                // isso nada de tingir a imagem: o fio delimita o card, e a
                // seleção vira um CONTORNO limão FORA dele (outline, que não
                // ocupa layout, então nenhuma miniatura pula de tamanho ao ser
                // escolhida) mais o selo no canto.
                'group relative aspect-square overflow-hidden rounded-sm border border-border transition-colors',
                'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
                selected
                  ? 'border-accent outline-2 outline-offset-2 outline-accent'
                  : 'hover:border-muted',
              )}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt={item.caption?.slice(0, 60) ?? 'Post do Instagram'}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-surface-2 text-muted">
                  <Images className="size-6" />
                </div>
              )}

              {/* Véu que vai ao fundo da página: é ele que garante o contraste
                  do contador sobre qualquer foto, inclusive a toda branca. */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/75 to-transparent px-2 pt-5 pb-1.5">
                <div className="label flex items-center gap-2.5 text-[9px] text-foreground tabular-nums">
                  <span className="flex items-center gap-1">
                    <Heart className="size-3" />
                    {item.like_count ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="size-3" />
                    {item.comments_count ?? 0}
                  </span>
                </div>
              </div>

              {/* Mesmo motivo do véu: o glifo de tipo mora numa plaquinha
                  opaca em vez de contar com sombra por cima da foto. */}
              {item.media_type === 'VIDEO' && (
                <span className="absolute top-1.5 right-1.5 rounded-sm bg-background/85 p-1">
                  <Play className="size-3 fill-foreground text-foreground" />
                </span>
              )}
              {item.media_type === 'CAROUSEL_ALBUM' && (
                <span className="absolute top-1.5 right-1.5 rounded-sm bg-background/85 p-1">
                  <Images className="size-3 text-foreground" />
                </span>
              )}

              {selected && (
                <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-sm bg-accent">
                  <Check className="size-3 text-background" strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {media.length === 0 && !error && (
        <p className="mt-4 text-center text-xs text-muted">
          Nenhum post encontrado nessa conta.
        </p>
      )}
    </div>
  )
}
