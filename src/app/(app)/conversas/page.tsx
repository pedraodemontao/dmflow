import { MessagesSquare } from 'lucide-react'

import { Inbox } from '@/components/conversas/inbox'
import { EmptyState } from '@/components/ui'
import {
  getCannedReplies,
  getInbox,
  getInboxCounts,
  getThread,
  type InboxFilter,
} from '@/lib/data'

export const dynamic = 'force-dynamic'

const FILTERS: InboxFilter[] = ['abertas', 'nao-lidas', 'adiadas', 'resolvidas']

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ fila?: string }>
}) {
  const { fila } = await searchParams
  const filter: InboxFilter = FILTERS.includes(fila as InboxFilter)
    ? (fila as InboxFilter)
    : 'abertas'

  const [items, counts, cannedReplies] = await Promise.all([
    getInbox(filter),
    getInboxCounts(),
    getCannedReplies(),
  ])

  const firstId = items[0]?.contact.id
  const initialThread = firstId ? await getThread(firstId) : null

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold">Conversas</h1>
        <span className="ml-2 text-xs text-muted">
          {counts.abertas} {counts.abertas === 1 ? 'aberta' : 'abertas'}
          {counts['nao-lidas'] > 0 && ` · ${counts['nao-lidas']} não lidas`}
        </span>
      </header>

      {counts.abertas === 0 && counts.resolvidas === 0 && counts.adiadas === 0 ? (
        <main className="flex-1 overflow-y-auto p-6">
          <EmptyState
            icon={<MessagesSquare className="size-8" />}
            title="Nenhuma conversa ainda"
            description="Quando alguém comentar ou mandar DM, a conversa aparece aqui para você acompanhar e responder na mão."
          />
        </main>
      ) : (
        <Inbox
          items={items}
          initialThread={initialThread}
          filter={filter}
          counts={counts}
          cannedReplies={cannedReplies}
        />
      )}
    </>
  )
}
