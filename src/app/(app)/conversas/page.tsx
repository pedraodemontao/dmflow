import { MessagesSquare } from 'lucide-react'

import { Inbox } from '@/components/conversas/inbox'
import { EmptyState } from '@/components/ui'
import { getInbox, getThread } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function ConversasPage() {
  const items = await getInbox()
  const firstId = items[0]?.contact.id
  const initialThread = firstId ? await getThread(firstId) : null
  const unread = items.reduce((total, item) => total + item.contact.unread_count, 0)

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold">Conversas</h1>
        <span className="ml-2 text-xs text-muted">
          {items.length} {items.length === 1 ? 'contato' : 'contatos'}
          {unread > 0 && ` · ${unread} não ${unread === 1 ? 'lida' : 'lidas'}`}
        </span>
      </header>

      {items.length === 0 ? (
        <main className="flex-1 overflow-y-auto p-6">
          <EmptyState
            icon={<MessagesSquare className="size-8" />}
            title="Nenhuma conversa ainda"
            description="Quando alguém comentar ou mandar DM, a conversa aparece aqui para você acompanhar e responder na mão."
          />
        </main>
      ) : (
        <Inbox items={items} initialThread={initialThread} />
      )}
    </>
  )
}
