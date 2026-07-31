import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/** Mesma tela de `page.tsx`: filtros no topo e a lista num `Card` com divisor
 *  entre as linhas (avatar + @ + etiquetas + estado da janela). */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando os contatos</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center border-b border-white/[0.06] px-6">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="ml-2 h-4 w-10" />
        <Skeleton className="ml-auto h-8 w-44 rounded-xl" />
        <Skeleton className="ml-2 h-8 w-32 rounded-xl" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['w-16', 'w-24', 'w-20', 'w-28'].map((width) => (
              <Skeleton key={width} className={`h-[26px] rounded-full ${width}`} />
            ))}
          </div>
        </div>

        <Card className="divide-y divide-border">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
              <Skeleton className="size-10 shrink-0 rounded-full" />

              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>

              <div className="hidden shrink-0 gap-1.5 sm:flex">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>

              <Skeleton className="h-5 w-28 shrink-0 rounded-full" />
            </div>
          ))}
        </Card>
      </main>
    </>
  )
}
