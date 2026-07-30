import Link from 'next/link'
import { Users } from 'lucide-react'

import { ContactFilters } from '@/components/contatos/contact-filters'
import { Badge, Card, EmptyState } from '@/components/ui'
import { getAllTags, getContacts } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function ContatosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; etiqueta?: string }>
}) {
  const { busca, etiqueta } = await searchParams
  const [contacts, tags] = await Promise.all([
    getContacts({ search: busca, tag: etiqueta }),
    getAllTags(),
  ])

  const filtering = Boolean(busca || etiqueta)

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold">Contatos</h1>
        <span className="ml-2 text-xs text-muted">({contacts.length})</span>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <ContactFilters tags={tags} search={busca ?? ''} activeTag={etiqueta ?? ''} />

        {contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" />}
            title={filtering ? 'Nada encontrado' : 'Nenhum contato ainda'}
            description={
              filtering
                ? 'Nenhum contato bate com esse filtro. Tente outra busca ou limpe a etiqueta.'
                : 'Quem comentar ou mandar DM aparece aqui automaticamente, com as etiquetas que o fluxo aplicar.'
            }
          />
        ) : (
          <Card className="divide-y divide-border">
            {contacts.map((contact) => (
              <Link
                key={contact.id}
                href={`/contatos/${contact.id}`}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-2/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {contact.username ? `@${contact.username}` : contact.ig_user_id}
                  </p>
                  {contact.name && <p className="truncate text-xs text-muted">{contact.name}</p>}
                </div>

                <div className="hidden flex-wrap gap-1 sm:flex">
                  {contact.tags.slice(0, 4).map((tag) => (
                    <Badge key={tag} tone="accent">
                      {tag}
                    </Badge>
                  ))}
                  {contact.tags.length > 4 && (
                    <Badge tone="neutral">+{contact.tags.length - 4}</Badge>
                  )}
                </div>

                {!contact.subscribed && <Badge tone="warning">descadastrado</Badge>}
                {contact.automation_paused && <Badge tone="neutral">em atendimento</Badge>}

                <Badge tone={contact.windowOpen ? 'success' : 'neutral'}>
                  {contact.windowOpen ? 'janela aberta' : 'janela fechada'}
                </Badge>
              </Link>
            ))}
          </Card>
        )}
      </main>
    </>
  )
}
