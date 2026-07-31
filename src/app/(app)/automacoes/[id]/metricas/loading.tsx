import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/** Mesma tela de `page.tsx`: taxa de conclusão em número grande com barra, os
 *  dois totais ao lado e o funil — uma linha por bloco, cada uma com a barra
 *  de proporção. Mudou a grade lá, muda aqui: esqueleto de outro formato faz a
 *  tela pular quando o conteúdo chega. */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando as métricas</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b px-6">
        <Skeleton className="h-8 w-10 rounded-md" />
        <Skeleton className="h-8 w-72 max-w-full rounded-sm" />
        <Skeleton className="h-6 w-20 rounded-sm" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-3xl space-y-3">
          <div className="grid gap-3 md:grid-cols-[1.15fr_1fr]">
            <Card className="p-5">
              <Skeleton className="h-2.5 w-28 rounded-sm" />
              <Skeleton className="mt-2 h-14 w-32 rounded-sm" />
              <Skeleton className="mt-2 h-3 w-52 max-w-full rounded-sm" />
              <Skeleton className="mt-4 h-2.5 w-full rounded-[2px]" />
            </Card>

            <Card className="grid grid-cols-2 divide-x divide-border">
              {[0, 1].map((i) => (
                <div key={i} className="p-5">
                  <Skeleton className="h-2.5 w-20 rounded-sm" />
                  <Skeleton className="mt-2 h-9 w-16 rounded-sm" />
                </div>
              ))}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <Skeleton className="h-2.5 w-28 rounded-sm" />
              <Skeleton className="mt-1.5 h-3 w-80 max-w-full rounded-sm" />
            </div>

            <div className="divide-y divide-border px-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="h-3 w-5 shrink-0 rounded-sm" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="mb-1.5 h-3 w-40 max-w-full rounded-sm" />
                    <Skeleton className="h-1.5 w-full rounded-[2px]" />
                  </div>
                  <Skeleton className="h-3 w-6 shrink-0 rounded-sm" />
                </div>
              ))}
            </div>
          </Card>

          <Skeleton className="h-3 w-full max-w-xl rounded-sm" />
        </div>
      </main>
    </>
  )
}
