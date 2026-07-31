import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Mesma tela de `page.tsx`: filtros no topo e a lista num `Card` com divisor
 * entre as linhas (avatar + @ + etiquetas + selo de janela).
 *
 * As formas seguem o que a página desenha — avatar e chip `rounded-sm`, campo e
 * botão `rounded-md`. Esqueleto redondo antes de conteúdo de canto duro faz a
 * tela pular no momento em que os dados chegam.
 */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando os contatos</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        <Skeleton className="h-7 w-36 rounded-sm" />
        <Skeleton className="h-3 w-20 rounded-sm" />
        <Skeleton className="ml-auto h-8 w-44 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-6xl">
          <div className="mb-4 space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-md" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Skeleton className="mr-1 h-2.5 w-14 rounded-sm" />
              {['w-16', 'w-24', 'w-20', 'w-28'].map((width) => (
                <Skeleton key={width} className={`h-[26px] rounded-sm ${width}`} />
              ))}
            </div>
          </div>

          <Card className="overflow-hidden">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3.5 border-b border-l-2 border-border border-l-transparent px-4 py-3.5 last:border-b-0"
              >
                <Skeleton className="size-10 shrink-0 rounded-sm" />

                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40 rounded-sm" />
                  <Skeleton className="h-3 w-28 rounded-sm" />
                </div>

                <div className="hidden shrink-0 gap-1.5 sm:flex">
                  <Skeleton className="h-[26px] w-16 rounded-sm" />
                  <Skeleton className="h-[26px] w-20 rounded-sm" />
                </div>

                <Skeleton className="h-[26px] w-36 shrink-0 rounded-sm" />
              </div>
            ))}
          </Card>
        </div>
      </main>
    </>
  )
}
