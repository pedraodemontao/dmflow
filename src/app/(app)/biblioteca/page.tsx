import { LibraryCard } from '@/components/biblioteca/library-card'
import { LibraryEmpty, type LibraryEmptyKind } from '@/components/biblioteca/library-empty'
import { LibraryFilters } from '@/components/biblioteca/library-filters'
import { LibraryStats } from '@/components/biblioteca/library-stats'
import { ProfileManager } from '@/components/biblioteca/profile-manager'
import { summarize } from '@/components/biblioteca/format'
import { parseOrder, parseStatus } from '@/components/biblioteca/query-params'

import { estimateScrapeCost } from '@/lib/data'
import { getLibraryScreen, LIBRARY_LIMIT } from './queries'

/**
 * Biblioteca de referência do nicho.
 *
 * A tela não é um catálogo — é a fila de decisão de "o que eu modelo no
 * próximo vídeo". Tudo aqui responde a isso: a faixa de cima abre com quantos
 * conteúdos valem modelar (não com o tamanho do acervo), a ordem padrão é
 * outlier (não plays), e o único uso de limão é marcar o conteúdo que passou
 * da régua.
 */

export const dynamic = 'force-dynamic'

function lastScrapeLabel(dates: Array<string | null>): string | null {
  const times = dates
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time))

  if (times.length === 0) return null

  return new Date(Math.max(...times)).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; categoria?: string; ordem?: string; status?: string }>
}) {
  const { busca, categoria, ordem, status } = await searchParams
  const order = parseOrder(ordem)
  const libraryStatus = parseStatus(status)

  // Em paralelo: o custo é lido para a tela poder avisar ANTES de gastar, e
  // uma ida a mais em série atrasaria a página por um número pequeno.
  const [data, custo] = await Promise.all([
    getLibraryScreen({
      search: busca,
      category: categoria,
      order,
      status: libraryStatus,
    }),
    estimateScrapeCost(),
  ])

  const summary = summarize(data.items)
  const scrapedAt = lastScrapeLabel(data.profiles.map((profile) => profile.lastScrapedAt))

  // A ordem dos testes é a ordem da culpa: banco, dono, raspagem, filtro. Trocar
  // isso faria a tela culpar o filtro por uma migration que não rodou.
  const emptyKind: LibraryEmptyKind | null = !data.tableReady
    ? 'sem-tabela'
    : data.profiles.length === 0
      ? 'sem-perfil'
      : !data.hasAnyItem
        ? scrapedAt === null
          ? 'nunca-raspado'
          : 'raspado-sem-item'
        : data.items.length === 0
          ? 'sem-resultado'
          : null

  // Só o recorte vazio convive com a faixa de números e os filtros — nos outros
  // quatro não há acervo para resumir nem categoria para filtrar, e mostrar
  // quatro zeros acima da instrução só afogaria a instrução.
  const acervoVazio = emptyKind !== null && emptyKind !== 'sem-resultado'

  return (
    <>
      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="display text-4xl text-foreground">Biblioteca</h1>
          <p className="label text-[10px] text-muted">
            <span className="text-foreground tabular-nums">{data.total}</span>{' '}
            {data.total === 1 ? 'conteúdo' : 'conteúdos'}
          </p>
        </div>

        {/* Quando a raspagem rodou pela última vez fica no chrome, e não num
            card: é a validade do que a tela inteira mostra. Biblioteca de um
            mês atrás continua respondendo com confiança sobre um nicho que já
            mudou, e essa é a única pista de que ela envelheceu. */}
        <div className="ml-auto hidden items-center gap-4 sm:flex">
          <p className="label text-[9px] text-muted">
            <span className="text-foreground tabular-nums">{data.profiles.length}</span>{' '}
            {data.profiles.length === 1 ? 'perfil' : 'perfis'}
          </p>
          <p className="label text-[9px] text-muted">
            raspagem{' '}
            <span className={scrapedAt ? 'text-foreground tabular-nums' : 'text-warning'}>
              {scrapedAt ?? 'nunca'}
            </span>
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {/* Mesmo cânone das outras telas: a régua tracejada delimita a coluna,
            senão a grade se estica até a borda e a página perde a medida. */}
        <div className="canon mx-auto w-full max-w-7xl">
          {/* Sempre visível, menos quando a tabela nem existe: é daqui que se
              adiciona perfil, importa a lista e dispara a raspagem. Deixar
              essas ações só dentro do estado vazio fazia elas sumirem assim
              que o primeiro perfil entrava — e perfil ruim conta como "não
              vazio" para a tela e como "vazio" para quem usa. */}
          {emptyKind !== 'sem-tabela' && (
            <ProfileManager profiles={data.profiles} custoEstimado={custo.usd} />
          )}

          {acervoVazio && emptyKind ? (
            <LibraryEmpty kind={emptyKind} profiles={data.profiles} custoEstimado={custo.usd} />
          ) : (
            <>
              {/* A faixa some quando o recorte não devolve nada: "vale modelar:
                  0" com a barra vazia logo acima de "nada bate com esse
                  recorte" repete a mesma notícia duas vezes, e a segunda é a
                  que ensina o que fazer. Os filtros ficam — são a saída. */}
              {data.items.length > 0 && (
                <div className="mb-5">
                  <LibraryStats summary={summary} />
                </div>
              )}

              <LibraryFilters
                search={busca ?? ''}
                category={categoria ?? ''}
                order={order}
                status={libraryStatus}
                categories={data.categories}
              />

              {emptyKind ? (
                <LibraryEmpty kind={emptyKind} profiles={data.profiles} custoEstimado={custo.usd} />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {data.items.map((item) => (
                      <LibraryCard key={item.id} item={item} />
                    ))}
                  </div>

                  {data.truncated && (
                    <p className="mt-5 text-center text-xs text-muted">
                      Mostrando os {LIBRARY_LIMIT} primeiros de {data.total}. Estreite o recorte pela
                      busca ou pela categoria para ver o resto.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  )
}
