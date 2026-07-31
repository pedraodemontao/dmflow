import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto do `AutomationEditor` — vale para `/automacoes/nova` e
 * `/automacoes/[id]`, que renderizam o mesmo componente e abrem no mesmo passo
 * ("Gatilho"). Fica aqui, e não dentro de um `loading.tsx`, porque as duas
 * rotas precisam do mesmo desenho e um `loading.tsx` não deve importar o outro.
 *
 * A grade de posts é a parte lenta: `loadMedia()` fala com a Meta antes de a
 * página existir.
 */
export function EditorSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <span className="sr-only">Carregando a automação</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center gap-4 border-b px-6">
        <Skeleton className="size-4 shrink-0 rounded-sm" />
        <Skeleton className="h-4 w-56 max-w-full flex-1 rounded-sm" />

        {/* As três abas: rótulo curto com o traço do passo aberto embaixo. */}
        <div className="flex shrink-0 items-center gap-1">
          {['w-24', 'w-36', 'w-28'].map((width) => (
            <Skeleton key={width} className={`h-3 rounded-sm ${width}`} />
          ))}
        </div>

        <Skeleton className="h-4 w-16 shrink-0 rounded-sm" />
        <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <Skeleton className="h-2.5 w-32 rounded-sm" />
            <Skeleton className="mt-2 h-6 w-80 max-w-full rounded-sm" />
            <Skeleton className="mt-2 h-3 w-96 max-w-full rounded-sm" />
          </div>

          {/* As três formas de disparar */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-md border border-border p-4">
                <Skeleton className="h-2.5 w-32 rounded-sm" />
                <Skeleton className="mt-1.5 h-3 w-full rounded-sm" />
                <Skeleton className="mt-1 h-3 w-2/3 rounded-sm" />
              </div>
            ))}
          </div>

          {/* Escolha do post */}
          <Card className="p-5">
            <Skeleton className="h-3 w-40 rounded-sm" />
            <Skeleton className="mt-1.5 mb-4 h-3 w-80 max-w-full rounded-sm" />

            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-2.5 w-36 rounded-sm" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="aspect-square rounded-sm" />
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}
