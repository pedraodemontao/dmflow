import Link from 'next/link'
import { Download, Users } from 'lucide-react'

import { ContactFilters } from '@/components/contatos/contact-filters'
import { ResetTeste } from '@/components/contatos/reset-teste'
import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { getAllTags, getContacts } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function ContatosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; etiqueta?: string; post?: string }>
}) {
  const { busca, etiqueta, post } = await searchParams
  const [contacts, tags] = await Promise.all([
    getContacts({ search: busca, tag: etiqueta, sourceId: post }),
    getAllTags(),
  ])

  const filtering = Boolean(busca || etiqueta || post)

  return (
    <>
      <header className="glass-chrome flex h-16 shrink-0 items-center border-b border-white/[0.06] px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Contatos</h1>
        <span className="ml-2 font-mono text-xs text-muted">({contacts.length})</span>

        <div className="ml-auto flex items-center gap-2">
          {contacts.length > 0 && <ResetTeste total={contacts.length} />}
        </div>

        {contacts.length > 0 && (
          <a
            className="ml-2"
            href={`/api/contatos/export?${new URLSearchParams({
              ...(busca ? { busca } : {}),
              ...(etiqueta ? { etiqueta } : {}),
              ...(post ? { post } : {}),
            })}`}
          >
            <Button size="sm" variant="outline">
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </a>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-5xl">
          <ContactFilters tags={tags} search={busca ?? ''} activeTag={etiqueta ?? ''} />

          {post && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <span className="text-xs text-muted">Só quem veio de um post específico</span>
              <Link href="/contatos" className="ml-auto text-xs text-accent hover:underline">
                limpar
              </Link>
            </div>
          )}

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
                  className="flex items-center gap-4 p-4 transition-colors duration-150 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {contact.username ? `@${contact.username}` : contact.ig_user_id}
                    </p>
                    {contact.name && (
                      <p className="truncate text-xs text-muted">{contact.name}</p>
                    )}
                  </div>

                  {/* Etiquetas do usuário: neutras, senão uma linha com várias
                      etiquetas vira uma fileira de pontos laranja — o accent
                      deixa de significar algo específico quando está em toda
                      parte. */}
                  <div className="hidden flex-wrap gap-1 sm:flex">
                    {contact.tags.slice(0, 4).map((tag) => (
                      <Badge key={tag} tone="neutral">
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
        </div>
      </main>
    </>
  )
}
