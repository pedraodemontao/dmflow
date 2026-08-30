import Link from 'next/link'
import { Plus, Send } from 'lucide-react'

import { PublicationRow } from '@/components/publicacoes/publication-row'
import { Button, Card, EmptyState } from '@/components/ui'
import { getPublications } from './queries'

/**
 * As publicações: o que vai sair, o que saiu e o que falhou.
 *
 * A lista mostra o ERRO na linha, não num log. Publicação que falhou em
 * silêncio é post que o dono acha que saiu — o mesmo tipo de bug do gatilho
 * preso a post velho, só que do outro lado.
 */

export const dynamic = 'force-dynamic'

export default async function PublicacoesPage() {
  const publications = await getPublications()

  const agendadas = publications.filter((p) => p.status === 'scheduled' || p.status === 'publishing').length
  const noAr = publications.filter((p) => p.status === 'published').length
  const falhas = publications.filter((p) => p.status === 'failed').length

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="display text-3xl leading-none">Publicações</h1>
          <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-muted">
            O post nasce aqui e sai pelo mesmo tick que entrega as DMs — com cap diário, silêncio e
            retentativa. Quando a automação vem junto, o gatilho já nasce apontado para o post novo.
          </p>
        </div>
        <Link href="/publicacoes/nova">
          <Button size="sm">
            <Plus className="size-3.5" />
            Nova
          </Button>
        </Link>
      </div>

      {publications.length > 0 && (
        <div className="mb-5 flex gap-6">
          <div>
            <p className="display text-2xl leading-none">{agendadas}</p>
            <p className="label mt-1 text-[9px] text-muted">na fila</p>
          </div>
          <div>
            <p className="display text-2xl leading-none">{noAr}</p>
            <p className="label mt-1 text-[9px] text-muted">no ar</p>
          </div>
          <div>
            <p className={`display text-2xl leading-none${falhas > 0 ? ' text-danger' : ''}`}>{falhas}</p>
            <p className="label mt-1 text-[9px] text-muted">{falhas === 1 ? 'falha' : 'falhas'}</p>
          </div>
        </div>
      )}

      {publications.length === 0 ? (
        <EmptyState
          icon={<Send className="size-5" />}
          title="Nenhuma publicação ainda"
          description="Suba uma imagem, um carrossel ou um reel, escreva a legenda e agende. O tick publica no horário, com jitter, e respeita o cap diário e o silêncio da conta."
        />
      ) : (
        <Card>
          <ul>
            {publications.map((publication) => (
              <PublicationRow key={publication.id} publication={publication} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
