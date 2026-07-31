import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/** Mesma lista de `page.tsx`: cânone `max-w-5xl`, linhas de 4 de padding com
 *  nome + gatilho à esquerda, a coluna de conclusão (rótulos + barra) no meio
 *  e a barra de ações à direita. */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando as automações</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center justify-between border-b px-6">
        <Skeleton className="h-8 w-44 rounded-sm" />
        <Skeleton className="h-8 w-40 rounded-md" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-5xl">
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Card key={i} className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-48 rounded-sm" />
                    <Skeleton className="h-6 w-16 rounded-sm" />
                  </div>
                  <Skeleton className="mt-1.5 h-3 w-64 max-w-full rounded-sm" />
                </div>

                <div className="hidden w-52 shrink-0 sm:block">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <Skeleton className="h-2.5 w-16 rounded-sm" />
                    <Skeleton className="h-2.5 w-20 rounded-sm" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-[2px]" />
                  <Skeleton className="mt-1.5 h-2.5 w-32 rounded-sm" />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {[0, 1, 2, 3].map((action) => (
                    <Skeleton key={action} className="size-8 rounded-md" />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
