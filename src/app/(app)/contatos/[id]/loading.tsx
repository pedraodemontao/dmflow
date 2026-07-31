import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/** Mesma grade de `page.tsx`: coluna de 320 com edição, origem e fluxos; o
 *  histórico de mensagens ocupa o resto. */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando o contato</span>

      <header className="glass-chrome flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-6">
        <Skeleton className="h-8 w-10 rounded-xl" />
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-5 w-40 rounded-full" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <Card className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-36 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-xl" />
              </div>

              <div>
                <Skeleton className="mb-1.5 h-3 w-20" />
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1 rounded-xl" />
                  <Skeleton className="h-8 w-10 rounded-xl" />
                </div>
              </div>

              <div>
                <Skeleton className="mb-1.5 h-3 w-40" />
                <Skeleton className="mb-2 h-8 w-full rounded-lg" />
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-28 rounded-xl" />
                  <Skeleton className="h-10 flex-1 rounded-xl" />
                  <Skeleton className="h-8 w-10 rounded-xl" />
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <Skeleton className="h-8 w-36 rounded-xl" />
              </div>
            </Card>

            <Card className="p-4">
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-1.5 h-3 w-48" />
            </Card>

            <Card className="p-4">
              <Skeleton className="mb-2 h-3 w-32" />
              <div className="space-y-1.5">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="ml-auto h-3 w-20" />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="flex max-h-[70vh] flex-col p-4">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="ml-auto h-8 w-32 rounded-xl" />
            </div>

            <div className="space-y-2 overflow-hidden">
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
                  <Skeleton className={`h-11 max-w-[75%] rounded-2xl ${message.width}`} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </>
  )
}
