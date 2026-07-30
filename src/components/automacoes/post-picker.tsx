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
        <p className="text-xs text-muted">
          {loading ? 'Atualizando…' : `${media.length} posts encontrados`}
        </p>
        <Button variant="ghost" size="sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-danger/10 p-3 text-xs text-danger">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {/* Qualquer post: o gatilho vale para a conta inteira. */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors',
            selectedId === null
              ? 'border-accent bg-accent/10'
              : 'border-border hover:border-muted',
          )}
        >
          <Globe className={cn('size-6', selectedId === null ? 'text-accent' : 'text-muted')} />
          <span className="text-xs font-medium">Qualquer post</span>
          <span className="text-[11px] leading-tight text-muted">
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
                'group relative aspect-square overflow-hidden rounded-xl border-2 transition-colors',
                selected ? 'border-accent' : 'border-transparent hover:border-border',
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

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
                <div className="flex items-center gap-2.5 text-[11px] text-white">
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

              {item.media_type === 'VIDEO' && (
                <Play className="absolute right-2 top-2 size-4 fill-white text-white drop-shadow" />
              )}
              {item.media_type === 'CAROUSEL_ALBUM' && (
                <Images className="absolute right-2 top-2 size-4 text-white drop-shadow" />
              )}

              {selected && (
                <div className="absolute left-2 top-2 flex size-5 items-center justify-center rounded-full bg-accent">
                  <Check className="size-3 text-white" strokeWidth={3} />
                </div>
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
