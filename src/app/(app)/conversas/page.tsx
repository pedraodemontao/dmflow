import { MessagesSquare } from 'lucide-react'

import { Card, EmptyState } from '@/components/ui'
import { getRecentMessages } from '@/lib/data'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ConversasPage() {
  const messages = await getRecentMessages()

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold">Conversas</h1>
        <span className="ml-2 text-xs text-muted">últimas {messages.length} mensagens</span>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare className="size-8" />}
            title="Nenhuma mensagem ainda"
            description="Tudo que entrar e sair pelas automações fica registrado aqui."
          />
        ) : (
          <Card className="divide-y divide-border">
            {messages.map((message) => (
              <div key={message.id} className="flex items-start gap-3 p-4">
                <span
                  className={cn(
                    'mt-1 size-2 shrink-0 rounded-full',
                    message.direction === 'in' ? 'bg-sky-400' : 'bg-accent',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs font-medium">
                      {message.contact?.username
                        ? `@${message.contact.username}`
                        : (message.contact?.ig_user_id ?? 'desconhecido')}
                    </p>
                    <span className="text-[11px] text-muted">
                      {message.direction === 'in' ? 'recebida' : 'enviada'}
                    </span>
                    <span className="ml-auto text-[11px] text-muted">
                      {new Date(message.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                    {message.text || <em>sem texto</em>}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </main>
    </>
  )
}
