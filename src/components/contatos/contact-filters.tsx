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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label mr-1 text-[9px] text-muted">Etiquetas</span>
          {tags.map((tag) => (
            // A etiqueta escolhida é a única coisa marcada com a caneta: uma
            // por vez, preenchida em limão com tinta preta (16,2:1). As demais
            // ficam neutras — cor aqui significa "é esta", não "é uma etiqueta".
            <button
              key={tag}
              type="button"
              aria-pressed={tag === activeTag}
              onClick={() => apply(draft, tag === activeTag ? '' : tag)}
              className={cn(
                'label rounded-sm border px-2 py-1 text-[9.5px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                tag === activeTag
                  ? 'border-accent bg-accent text-background'
                  // Preenchimento próprio (`surface-2`) pelo mesmo motivo do
                  // `Input`: o fio de cabelo sozinho fica abaixo de 3:1 e não
                  // pode ser a única coisa que delimita um controle.
                  : 'border-border bg-surface-2 text-muted hover:border-muted hover:text-foreground',
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
