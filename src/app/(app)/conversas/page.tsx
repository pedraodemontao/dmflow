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
      {/*
        O resumo fica em monospace ao lado do título, não em número grande: o
        contador de cada fila já é protagonista dentro das abas do inbox, e
        repetir o mesmo dado em `display` faria a tela competir consigo mesma.
        Aqui ele existe para o caso vazio, onde não há abas nenhuma.
      */}
      <header className="chrome-panel flex h-16 shrink-0 items-center border-b border-border px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="display text-4xl text-foreground">Conversas</h1>
          <p className="label text-[10px] text-muted">
            <span className="text-foreground tabular-nums">{counts.abertas}</span>{' '}
            {counts.abertas === 1 ? 'aberta' : 'abertas'}
            {counts['nao-lidas'] > 0 && (
              <>
                {' · '}
                <span className="text-foreground tabular-nums">{counts['nao-lidas']}</span>{' '}
                {counts['nao-lidas'] === 1 ? 'não lida' : 'não lidas'}
              </>
            )}
          </p>
        </div>
      </header>

      {counts.abertas === 0 && counts.resolvidas === 0 && counts.adiadas === 0 ? (
        <main className="flex-1 overflow-y-auto p-6">
          <div className="canon mx-auto w-full max-w-3xl">
            <EmptyState
              icon={<MessagesSquare className="size-8" />}
              title="Nenhuma conversa ainda"
              description="Quando alguém comentar ou mandar DM, a conversa aparece aqui para você acompanhar e responder na mão."
            />
          </div>
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
