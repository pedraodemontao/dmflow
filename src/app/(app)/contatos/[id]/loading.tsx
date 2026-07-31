import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Mesma grade de `page.tsx`: coluna de 320 com o número de seguidores, a
 * edição, a origem e os fluxos; o histórico de mensagens ocupa o resto.
 *
 * Os balões repetem o canto duro do lado de quem fala (`rounded-tl-none` para
 * quem chegou, `rounded-tr-none` para quem saiu) — é a forma que identifica o
 * lado antes do texto aparecer.
 */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando o contato</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        <Skeleton className="h-8 w-10 rounded-md" />
        <Skeleton className="size-8 shrink-0 rounded-sm" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-7 w-48 rounded-sm" />
          <Skeleton className="h-3 w-32 rounded-sm" />
        </div>
        <Skeleton className="h-[26px] w-40 rounded-sm" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <Card className="p-4">
              <Skeleton className="h-2.5 w-20 rounded-sm" />
              <Skeleton className="mt-2 h-9 w-28 rounded-sm" />
              <Skeleton className="mt-2 h-3 w-full rounded-sm" />
            </Card>

            <Card className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-[26px] w-36 rounded-sm" />
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>

              <div>
                <Skeleton className="mb-1.5 h-2.5 w-20 rounded-sm" />
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Skeleton className="h-[26px] w-16 rounded-sm" />
                  <Skeleton className="h-[26px] w-20 rounded-sm" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1 rounded-md" />
                  <Skeleton className="h-8 w-10 rounded-md" />
                </div>
              </div>

              <div>
                <Skeleton className="mb-1.5 h-2.5 w-40 rounded-sm" />
                <Skeleton className="mb-2 h-8 w-full rounded-sm" />
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-28 rounded-md" />
                  <Skeleton className="h-10 flex-1 rounded-md" />
                  <Skeleton className="h-8 w-10 rounded-md" />
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <Skeleton className="h-8 w-36 rounded-md" />
              </div>
            </Card>

            <Card className="p-4">
              <Skeleton className="mb-2 h-2.5 w-16 rounded-sm" />
              <Skeleton className="h-4 w-40 rounded-sm" />
              <Skeleton className="mt-1.5 h-3 w-48 rounded-sm" />
            </Card>

            <Card className="p-4">
              <Skeleton className="mb-2 h-2.5 w-32 rounded-sm" />
              <div className="divide-y divide-border">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                    <Skeleton className="h-4 w-32 rounded-sm" />
                    <Skeleton className="ml-auto h-2.5 w-20 rounded-sm" />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="flex max-h-[70vh] flex-col p-4">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-2.5 w-36 rounded-sm" />
              <Skeleton className="ml-auto h-8 w-32 rounded-md" />
            </div>

            <div className="space-y-2.5 overflow-hidden">
              {[
                { side: 'in', width: 'w-56' },
                { side: 'out', width: 'w-64' },
                { side: 'in', width: 'w-44' },
                { side: 'out', width: 'w-52' },
              ].map((message, i) => (
                <div
                  key={i}
                  className={message.side === 'in' ? 'flex justify-start' : 'flex justify-end'}
                >
                  <Skeleton
                    className={`h-14 max-w-[75%] rounded-md ${message.width} ${
                      message.side === 'in' ? 'rounded-tl-none' : 'rounded-tr-none'
                    }`}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </>
  )
}
