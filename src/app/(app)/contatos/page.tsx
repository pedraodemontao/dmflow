import { Users } from 'lucide-react'

import { Badge, Card, EmptyState } from '@/components/ui'
import { getContacts } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function ContatosPage() {
  const contacts = await getContacts()

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold">Contatos</h1>
        <span className="ml-2 text-xs text-muted">({contacts.length})</span>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" />}
            title="Nenhum contato ainda"
            description="Quem comentar ou mandar DM aparece aqui automaticamente, com as etiquetas que o fluxo aplicar."
          />
        ) : (
          <Card className="divide-y divide-border">
            {contacts.map((contact) => {
              const open = contact.windowOpen

              return (
                <div key={contact.id} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {contact.username ? `@${contact.username}` : contact.ig_user_id}
                    </p>
                    {contact.name && (
                      <p className="truncate text-xs text-muted">{contact.name}</p>
                    )}
                  </div>

                  <div className="hidden flex-wrap gap-1 sm:flex">
                    {contact.tags.map((tag) => (
                      <Badge key={tag} tone="accent">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <Badge tone={open ? 'success' : 'neutral'}>
                    {open ? 'janela aberta' : 'janela fechada'}
                  </Badge>
                </div>
              )
            })}
          </Card>
        )}
      </main>
    </>
  )
}
