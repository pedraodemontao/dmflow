import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto do inbox: as duas colunas do `Inbox` — fila de 80 de largura à
 * esquerda (abas de contador + itens) e a conversa à direita (cabeçalho de 14,
 * balões alternados e o compositor no rodapé). Sem isso a tela anterior fica
 * parada enquanto três consultas ao Supabase voltam.
 *
 * As medidas seguem o que a página desenha: avatar `rounded-sm` (não redondo),
 * balão `rounded-md`, botão e campo `rounded-md`. Esqueleto com outra forma faz
 * a tela pular quando o conteúdo chega, que é justamente o que ele evita.
 */
export default function Loading() {
  return (
    <>
      <span className="sr-only">Carregando as conversas</span>

      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        <Skeleton className="h-7 w-44 rounded-sm" />
        <Skeleton className="h-3 w-28 rounded-sm" />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="flex shrink-0 border-b border-border">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex-1 border-b-2 border-b-transparent px-1 pt-2.5 pb-2">
                <Skeleton className="mx-auto h-3.5 w-5 rounded-sm" />
                <Skeleton className="mx-auto mt-1.5 h-2.5 w-14 rounded-sm" />
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 border-b border-l-2 border-border border-l-transparent px-3.5 py-3"
              >
                <Skeleton className="mt-0.5 size-8 shrink-0 rounded-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-28 rounded-sm" />
                    <Skeleton className="ml-auto h-2.5 w-8 shrink-0 rounded-sm" />
                  </div>
                  <Skeleton className="mt-1 h-3 w-full rounded-sm" />
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="chrome-panel flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-5">
            <Skeleton className="size-8 shrink-0 rounded-sm" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-36 rounded-sm" />
              <Skeleton className="h-2.5 w-24 rounded-sm" />
            </div>
            <Skeleton className="h-[26px] w-40 rounded-sm" />
            <div className="ml-auto flex items-center gap-1">
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
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
                <Skeleton
                  className={`h-16 max-w-[70%] rounded-md ${message.width} ${
                    message.side === 'in' ? 'rounded-tl-none' : 'rounded-tr-none'
                  }`}
                />
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-border p-4">
            <div className="flex items-end gap-2">
              <Skeleton className="h-8 w-10 shrink-0 rounded-md" />
              <Skeleton className="h-[68px] flex-1 rounded-md" />
              <Skeleton className="h-10 w-12 shrink-0 rounded-md" />
            </div>
            <Skeleton className="mt-2 h-3 w-80 max-w-full rounded-sm" />
          </div>
        </section>
      </div>
    </>
  )
}
