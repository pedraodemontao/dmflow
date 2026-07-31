import Link from 'next/link'
import { Download, Users } from 'lucide-react'

import { ContactFilters } from '@/components/contatos/contact-filters'
import { ResetTeste } from '@/components/contatos/reset-teste'
import { WindowBadge } from '@/components/shared/window-badge'
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui'
import { getAllTags, getContacts } from '@/lib/data'

const followerFormatter = new Intl.NumberFormat('pt-BR', { notation: 'compact' })

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
      <header className="chrome-panel flex h-16 shrink-0 items-center border-b border-border px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="display text-4xl text-foreground">Contatos</h1>
          <p className="label text-[10px] text-muted">
            <span className="text-foreground tabular-nums">{contacts.length}</span>{' '}
            {contacts.length === 1 ? 'contato' : 'contatos'}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {contacts.length > 0 && <ResetTeste total={contacts.length} />}

          {contacts.length > 0 && (
            <a
              className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              href={`/api/contatos/export?${new URLSearchParams({
                ...(busca ? { busca } : {}),
                ...(etiqueta ? { etiqueta } : {}),
                ...(post ? { post } : {}),
              })}`}
            >
              <Button size="sm" variant="outline" tabIndex={-1}>
                <Download className="size-4" />
                Exportar CSV
              </Button>
            </a>
          )}
        </div>
      </header>

      {/* Mesmo cânone do painel: a régua tracejada delimita a coluna de
          conteúdo, senão a lista se estica até a borda da tela e a página
          perde a medida que as outras têm. */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-6xl">
          <ContactFilters tags={tags} search={busca ?? ''} activeTag={etiqueta ?? ''} />

          {post && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
              <span className="label text-[10px] text-muted">Filtrado por post</span>
              <span className="text-xs text-muted">só quem comentou nesse conteúdo</span>
              <Link
                href="/contatos"
                className="label ml-auto rounded-sm text-[10px] text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
              >
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
            // O fio entre as linhas é `border-b` de cada uma, não `divide-y`: a
            // regra do `divide-*` tem especificidade maior que a classe da linha
            // e pintaria por cima do traço lateral de destaque (que precisa
            // ficar transparente em repouso).
            <Card className="overflow-hidden">
              {contacts.map((contact) => {
                const label = contact.username ? `@${contact.username}` : contact.ig_user_id
                const secondary = [
                  contact.name,
                  contact.follower_count != null
                    ? `${followerFormatter.format(contact.follower_count)} seguidores`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')

                return (
                  <Link
                    key={contact.id}
                    href={`/contatos/${contact.id}`}
                    className="flex items-center gap-3.5 border-b border-l-2 border-border border-l-transparent px-4 py-3.5 transition-colors duration-150 last:border-b-0 hover:border-l-accent hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  >
                    <Avatar
                      src={contact.profile_pic_url}
                      label={label}
                      verified={contact.is_verified}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{label}</p>
                      {secondary && <p className="truncate text-xs text-muted">{secondary}</p>}
                    </div>

                    {/* Etiqueta é dado do contato, não estado: quadrado neutro.
                        O limão desta tela fica reservado para a etiqueta que
                        está filtrando a lista e para o traço da linha sob o
                        cursor. */}
                    <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
                      {contact.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag} tone="neutral">
                          {tag}
                        </Badge>
                      ))}
                      {contact.tags.length > 4 && (
                        <Badge tone="neutral">+{contact.tags.length - 4}</Badge>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {!contact.subscribed && <Badge tone="warning">descadastrado</Badge>}
                      {contact.automation_paused && <Badge tone="neutral">em atendimento</Badge>}
                      <WindowBadge open={contact.windowOpen} />
                    </div>
                  </Link>
                )
              })}
            </Card>
          )}
        </div>
      </main>
    </>
  )
}
