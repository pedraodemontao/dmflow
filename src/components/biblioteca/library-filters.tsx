'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search, X } from 'lucide-react'

import { Button, Input, Label, Select } from '@/components/ui'
import { cn } from '@/lib/utils'

import {
  LIBRARY_ORDER_LABEL,
  LIBRARY_ORDERS,
  LIBRARY_STATUS_LABEL,
  LIBRARY_STATUSES,
  type LibraryOrder,
  type LibraryStatus,
} from './query-params'

/**
 * Busca, categoria, ordem e "já assisti".
 *
 * O estado vive na URL, e não em `useState`, pelo mesmo motivo da lista de
 * contatos: recorte de biblioteca é coisa que se manda para si mesmo e se
 * volta depois ("os outliers de vibe-coding que eu ainda não vi"). Estado só
 * de cliente morreria no F5 e não caberia num link.
 */

export function LibraryFilters({
  search,
  category,
  order,
  status,
  categories,
}: {
  search: string
  category: string
  order: LibraryOrder
  status: LibraryStatus
  categories: string[]
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(search)

  function apply(next: Partial<{ busca: string; categoria: string; ordem: string; status: string }>) {
    const current = {
      busca: draft.trim(),
      categoria: category,
      ordem: order,
      status,
      ...next,
    }

    const params = new URLSearchParams()
    if (current.busca) params.set('busca', current.busca)
    if (current.categoria) params.set('categoria', current.categoria)
    // Só escreve o que difere do padrão: link curto é link que se lê.
    if (current.ordem !== 'outlier') params.set('ordem', current.ordem)
    if (current.status !== 'todos') params.set('status', current.status)

    const query = params.toString()
    router.push(query ? `/biblioteca?${query}` : '/biblioteca')
  }

  const filtering = Boolean(search || category || status !== 'todos' || order !== 'outlier')

  return (
    <div className="mb-5 space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          apply({})
        }}
      >
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            value={draft}
            placeholder="Buscar por legenda, @perfil, gancho ou estrutura"
            aria-label="Buscar na biblioteca"
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>

        <Button type="submit" variant="outline">
          Buscar
        </Button>

        {filtering && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft('')
              router.push('/biblioteca')
            }}
          >
            <X className="size-4" />
            Limpar
          </Button>
        )}
      </form>

      <div className="flex flex-wrap items-end gap-3">
        {categories.length > 0 && (
          <div className="min-w-[200px]">
            <Label htmlFor="biblioteca-categoria">Categoria</Label>
            <Select
              id="biblioteca-categoria"
              value={category}
              onChange={(e) => apply({ categoria: e.target.value })}
            >
              <option value="">Todas</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="min-w-[180px]">
          <Label htmlFor="biblioteca-ordem">Ordenar por</Label>
          <Select
            id="biblioteca-ordem"
            value={order}
            onChange={(e) => apply({ ordem: e.target.value })}
          >
            {LIBRARY_ORDERS.map((item) => (
              <option key={item} value={item}>
                {LIBRARY_ORDER_LABEL[item]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          {/* Mesma gramática das etiquetas de contato: um só marcado por vez,
              preenchido em limão com tinta preta. Aqui a cor significa "é este
              o recorte", que é seleção — o uso que a direção reserva para ela. */}
          {LIBRARY_STATUSES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === status}
              onClick={() => apply({ status: item })}
              className={cn(
                'label rounded-sm border px-2.5 py-1.5 text-[9.5px] transition-colors',
                'focus-visible:ring-accent focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                item === status
                  ? 'border-accent bg-accent text-background'
                  : 'border-border bg-surface-2 text-muted hover:border-muted hover:text-foreground',
              )}
            >
              {LIBRARY_STATUS_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {order === 'outlier' && (
        <p className="text-xs leading-relaxed text-muted">
          Ordenado por <span className="text-foreground">outlier</span>: quantas vezes o vídeo passou
          da mediana de plays do próprio perfil. Ordenar por plays absolutos ranquearia o tamanho da
          audiência — que não é replicável.
        </p>
      )}
    </div>
  )
}
