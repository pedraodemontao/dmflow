import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto do inbox: as duas colunas do `Inbox` — fila de 72 de largura à
 * esquerda (abas + itens) e a conversa à direita (cabeçalho de 14, balões
 * alternados e o compositor no rodapé). Sem isso a tela anterior fica parada
 * enquanto três consultas ao Supabase voltam.
 */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando as conversas</span>

      <header className="glass-chrome flex h-16 shrink-0 items-center border-b border-white/[0.06] px-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="ml-2 h-4 w-28" />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="flex shrink-0 gap-1 border-b border-border p-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 flex-1 rounded-md" />
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 border-b border-l-2 border-l-transparent border-border px-3.5 py-3"
              >
                <Skeleton className="mt-0.5 size-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="ml-auto h-3 w-8 shrink-0" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="glass-chrome flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-32 rounded-full" />
            <div className="ml-auto flex items-center gap-1">
              <Skeleton className="size-8 rounded-xl" />
              <Skeleton className="size-8 rounded-xl" />
              <Skeleton className="h-8 w-24 rounded-xl" />
              <Skeleton className="h-8 w-24 rounded-xl" />
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-hidden px-5 py-4">
            {[
              { side: 'in', width: 'w-64' },
              { side: 'out', width: 'w-72' },
              { side: 'in', width: 'w-48' },
              { side: 'out', width: 'w-56' },
              { side: 'in', width: 'w-40' },
            ].map((message, i) => (
              <div
                key={i}
                className={message.side === 'in' ? 'flex justify-start' : 'flex justify-end'}
              >
                <Skeleton className={`h-14 max-w-[70%] rounded-2xl ${message.width}`} />
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-border p-4">
            <div className="flex items-end gap-2">
              <Skeleton className="h-8 w-10 shrink-0 rounded-xl" />
              <Skeleton className="h-[68px] flex-1 rounded-xl" />
              <Skeleton className="h-10 w-12 shrink-0 rounded-xl" />
            </div>
            <Skeleton className="mt-2 h-3 w-80 max-w-full" />
          </div>
        </section>
      </div>
    </>
  )
}
