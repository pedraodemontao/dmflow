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

      <header className="glass-chrome flex h-16 shrink-0 items-center gap-4 border-b border-white/[0.06] px-6">
        <Skeleton className="size-4 shrink-0 rounded-md" />
        <Skeleton className="h-4 w-56 max-w-full flex-1" />

        <div className="flex shrink-0 items-center gap-1">
          {['w-24', 'w-36', 'w-28'].map((width) => (
            <Skeleton key={width} className={`h-7 rounded-xl ${width}`} />
          ))}
        </div>

        <Skeleton className="h-5 w-16 shrink-0" />
        <Skeleton className="h-8 w-24 shrink-0 rounded-xl" />
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-3 w-96 max-w-full" />
          </div>

          {/* As três formas de disparar */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2 rounded-2xl border border-border p-4">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>

          {/* Escolha do post */}
          <Card className="p-5">
            <Skeleton className="mb-2 h-4 w-40" />
            <Skeleton className="mb-4 h-3 w-80 max-w-full" />

            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-8 w-28 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="aspect-square rounded-2xl" />
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
