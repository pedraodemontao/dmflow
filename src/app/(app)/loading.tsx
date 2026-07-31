import { Card } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto do painel — mesmo cânone (`max-w-6xl`), mesma ordem do
 * `page.tsx`: cockpit (ação → contexto), operação, automações. Cada bloco
 * ocupa a altura do que vai substituir, para a tela não pular quando o
 * conteúdo real chegar.
 */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando o painel</span>

      <header className="glass-chrome flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-8 w-40 rounded-xl" />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-6xl space-y-6">
          {/* Cockpit — precisa de ação */}
          <section>
            <Skeleton className="mb-3 h-3 w-32" />
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3 rounded-2xl border border-border p-4">
                  <Skeleton className="mt-0.5 size-4 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Cockpit — contexto */}
          <section>
            <Skeleton className="mb-3 h-3 w-20" />
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="size-6 rounded-md" />
                </div>
                <Skeleton className="mt-2 h-9 w-16" />
                <Skeleton className="mt-2 h-5 w-32 rounded-full" />
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border p-4">
                  <Skeleton className="size-4 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-3 w-72 max-w-full" />
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-3 w-4 shrink-0" />
                      <Skeleton className="size-12 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-8 w-10 shrink-0" />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </section>

          {/* Operação: trava geral + horário de silêncio */}
          <Card className="space-y-4 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-4 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-full max-w-lg" />
              </div>
              <Skeleton className="h-8 w-28 shrink-0 rounded-xl" />
            </div>
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <Skeleton className="size-4 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full max-w-lg" />
              </div>
              <Skeleton className="h-10 w-24 shrink-0 rounded-xl" />
              <Skeleton className="h-10 w-24 shrink-0 rounded-xl" />
            </div>
          </Card>

          {/* Suas automações */}
          <section>
            <Skeleton className="mb-3 h-3 w-28" />
            <div className="grid gap-3 lg:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-3 w-12 shrink-0" />
                  </div>
                  <div className="mt-3 flex gap-4">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
