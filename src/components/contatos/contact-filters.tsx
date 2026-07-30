'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search, X } from 'lucide-react'

import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils'

export function ContactFilters({
  tags,
  search,
  activeTag,
}: {
  tags: string[]
  search: string
  activeTag: string
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(search)

  function apply(nextSearch: string, nextTag: string) {
    const params = new URLSearchParams()
    if (nextSearch.trim()) params.set('busca', nextSearch.trim())
    if (nextTag) params.set('etiqueta', nextTag)
    const query = params.toString()
    router.push(query ? `/contatos?${query}` : '/contatos')
  }

  return (
    <div className="mb-4 space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          apply(draft, activeTag)
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            value={draft}
            placeholder="Buscar por @usuário ou nome"
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {(search || activeTag) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft('')
              apply('', '')
            }}
          >
            <X className="size-4" />
            Limpar
          </Button>
        )}
      </form>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => apply(draft, tag === activeTag ? '' : tag)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                tag === activeTag
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-muted hover:text-foreground',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
