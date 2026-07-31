import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/** Mesma lista de `page.tsx`: cânone `max-w-5xl`, linhas de 4 de padding com
 *  nome + gatilho à esquerda, três números no meio e a barra de ações à direita. */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando as automações</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-8 w-40 rounded-xl" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-5xl">
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Card key={i} className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>

                <div className="hidden shrink-0 gap-6 sm:flex">
                  {[0, 1, 2].map((column) => (
                    <div key={column} className="flex flex-col items-center gap-1.5">
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  ))}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {[0, 1, 2, 3].map((action) => (
                    <Skeleton key={action} className="size-8 rounded-xl" />
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
