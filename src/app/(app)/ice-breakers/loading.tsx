import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto dos ice breakers. A tela espera duas coisas: a conta no banco e a
 * lista publicada na Meta (chamada de rede, é a lenta) — por isso ela demora
 * mesmo com o banco rápido.
 */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando os ice breakers</span>

      <header className="glass-chrome flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
        <Skeleton className="h-7 w-44" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-2xl">
          <Card className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="mt-0.5 size-4 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>

            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end"
                >
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-44" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                  <Skeleton className="h-8 w-10 shrink-0 rounded-xl" />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-8 w-44 rounded-xl" />
              <Skeleton className="ml-auto h-8 w-52 rounded-xl" />
            </div>
          </Card>
        </div>
      </main>
    </>
  )
}
