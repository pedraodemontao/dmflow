import Link from 'next/link'
import { Database, FilterX, Radar, SearchX, Users } from 'lucide-react'

import type { LibraryProfileSummary } from '@/app/(app)/biblioteca/queries'
import { EmptyState } from '@/components/ui'

import { AddProfile } from './add-profile'
import { RunScrape } from './run-scrape'

/**
 * "Vazio" aqui não é um estado, são cinco — e confundi-los custa caro.
 *
 * Quem abre a biblioteca sem nada dentro precisa saber DE QUEM é a vez: do
 * banco (a migration não rodou), do dono (não cadastrou perfil), da raspagem
 * (nunca rodou, ou rodou e não trouxe nada) ou do próprio filtro que ele
 * acabou de digitar. Uma frase genérica — "Nenhum conteúdo encontrado", como
 * no projeto de origem — deixa as cinco situações com a mesma cara, e a mais
 * comum delas (nunca raspou) é justamente a que tem conserto em um clique.
 *
 * Por isso cada estado tem uma frase própria e uma saída própria, e a saída
 * nunca é um botão que não leva a lugar nenhum.
 */
export type LibraryEmptyKind =
  | 'sem-tabela'
  | 'sem-perfil'
  | 'nunca-raspado'
  | 'raspado-sem-item'
  | 'sem-resultado'

export function LibraryEmpty({
  kind,
  profiles,
  custoEstimado,
}: {
  kind: LibraryEmptyKind
  profiles: LibraryProfileSummary[]
  /** Custo estimado da próxima raspagem, em dólar. Mostrado antes de rodar. */
  custoEstimado: number
}) {
  if (kind === 'sem-tabela') {
    return (
      <EmptyState
        icon={<Database className="size-8" />}
        title="A biblioteca ainda não existe no banco"
        description="As tabelas da migration 0014 não responderam. Como não há CLI nem psql nesta máquina, ela é colada à mão: abra o SQL Editor do Supabase e rode supabase/migrations/0014_biblioteca.sql. Nada nesta tela funciona antes disso — e nada quebra por causa disso."
      />
    )
  }

  if (kind === 'sem-perfil') {
    return (
      <EmptyState
        icon={<Users className="size-8" />}
        title="Nenhum perfil de referência"
        description="A biblioteca é alimentada pelos perfis do nicho que você acompanha — a raspagem puxa os reels deles e calcula o que performou acima do normal de cada um. Comece por um perfil que você já modela: escreva o @, sem o arroba e sem link."
        action={<AddProfile />}
      />
    )
  }

  if (kind === 'nunca-raspado') {
    const esperando = profiles.filter((profile) => !profile.lastScrapedAt)

    return (
      <EmptyState
        icon={<Radar className="size-8" />}
        title="Perfis cadastrados, nenhum raspado ainda"
        description={`${profiles.length} ${
          profiles.length === 1 ? 'perfil está' : 'perfis estão'
        } na fila e a raspagem nunca rodou. Ela acontece na infraestrutura da Apify, sobre conteúdo público — não usa o token do Instagram da conta e não expõe o perfil restringido. Enquanto não rodar, não há reel para comparar.`}
        action={
          esperando.length > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <RunScrape custoEstimado={custoEstimado} perfisAtivos={esperando.length} />
              <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                {esperando.slice(0, 12).map((profile) => (
                  <span
                    key={profile.id}
                    className="label rounded-sm border border-border bg-surface-2 px-2 py-1 text-[9.5px] text-muted"
                  >
                    @{profile.username}
                  </span>
                ))}
                {esperando.length > 12 && (
                  <span className="label rounded-sm border border-border bg-surface-2 px-2 py-1 text-[9.5px] text-muted">
                    +{esperando.length - 12}
                  </span>
                )}
              </div>
            </div>
          ) : undefined
        }
      />
    )
  }

  if (kind === 'raspado-sem-item') {
    return (
      <EmptyState
        icon={<SearchX className="size-8" />}
        title="A raspagem rodou e não trouxe nada"
        description="Os perfis foram visitados, mas nenhum reel entrou no acervo. Costuma ser perfil privado, perfil sem reel público ou conta que mudou de @ desde o cadastro. Confira os @ da lista e rode de novo."
        action={<RunScrape custoEstimado={custoEstimado} perfisAtivos={profiles.length} />}
      />
    )
  }

  return (
    <EmptyState
      icon={<FilterX className="size-8" />}
      title="Nada bate com esse recorte"
      description="Existe conteúdo na biblioteca, só nenhum que case com a busca, a categoria e o estado escolhidos ao mesmo tempo. Solte um dos três — o filtro de “não vistos” é o que mais esconde coisa sem avisar."
      action={
        <Link
          href="/biblioteca"
          className="label focus-visible:ring-accent focus-visible:ring-offset-background rounded-sm text-[10px] text-accent hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          limpar filtros
        </Link>
      }
    />
  )
}
