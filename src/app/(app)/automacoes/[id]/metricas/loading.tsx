import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/** Mesma tela de `page.tsx`: três números no topo e um bloco por nó do fluxo,
 *  cada um com a barra de proporção embaixo. */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando as métricas</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-6">
        <Skeleton className="h-8 w-10 rounded-xl" />
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-3xl">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </Card>
            ))}
          </div>

          <Card className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="ml-auto h-4 w-8" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </Card>

          <Skeleton className="mt-4 h-3 w-full max-w-xl" />
        </div>
      </main>
    </>
  )
}
