import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Mesmo esqueleto de `page.tsx`: faixa de números (um cartão grande + tira de
 * três), linha de filtros e a grade de cards com a placa da miniatura no topo.
 *
 * As formas seguem o que a página desenha — card e campo em `rounded-md`, chip
 * em `rounded-sm`. Esqueleto redondo antes de conteúdo de canto duro faz a tela
 * pular no instante em que os dados chegam.
 */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando a biblioteca</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        <Skeleton className="h-7 w-40 rounded-sm" />
        <Skeleton className="h-3 w-24 rounded-sm" />
        <Skeleton className="ml-auto hidden h-3 w-16 rounded-sm sm:block" />
        <Skeleton className="hidden h-3 w-28 rounded-sm sm:block" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-7xl">
          <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
            <Card className="p-5">
              <Skeleton className="h-2.5 w-24 rounded-sm" />
              <Skeleton className="mt-3 h-14 w-28 rounded-sm" />
              <Skeleton className="mt-3 h-8 w-full rounded-sm" />
              <Skeleton className="mt-4 h-2.5 w-full rounded-[2px]" />
            </Card>

            <Card className="overflow-hidden">
              <div className="grid h-full divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="p-5">
                    <Skeleton className="h-2.5 w-24 rounded-sm" />
                    <Skeleton className="mt-3 h-9 w-20 rounded-sm" />
                    <Skeleton className="mt-3 h-6 w-full rounded-sm" />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-10 min-w-[220px] flex-1 rounded-md" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Skeleton className="h-10 w-[200px] rounded-md" />
              <Skeleton className="h-10 w-[180px] rounded-md" />
              <div className="flex gap-1.5 pb-1">
                {['w-16', 'w-24', 'w-20'].map((width) => (
                  <Skeleton key={width} className={`h-[30px] rounded-sm ${width}`} />
                ))}
              </div>
            </div>
            <Skeleton className="h-8 w-full rounded-sm" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="overflow-hidden rounded-md border border-border bg-surface">
                <Skeleton className="aspect-[4/5] w-full rounded-none" />

                <div className="space-y-2.5 p-3">
                  <Skeleton className="h-4 w-32 rounded-sm" />
                  <Skeleton className="h-2.5 w-40 rounded-sm" />
                  <Skeleton className="h-10 w-full rounded-sm" />
                  <Skeleton className="h-3 w-full rounded-sm" />
                  <Skeleton className="h-8 w-full rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
