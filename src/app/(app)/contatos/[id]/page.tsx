import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Bot, User } from 'lucide-react'

import {
  ContactFields,
  ContactTags,
  DeleteContact,
  SubscriptionToggle,
} from '@/components/contatos/contact-editor'
import { Badge, Button, Card } from '@/components/ui'
import { getContactDetail } from '@/lib/data'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const RUN_LABEL: Record<string, string> = {
  running: 'rodando',
  waiting_reply: 'esperando resposta',
  sleeping: 'em espera',
  done: 'concluído',
  failed: 'falhou',
}

export default async function ContatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getContactDetail(id)
  if (!detail) notFound()

  const { contact, messages, runs } = detail

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-6">
        <Link href="/contatos">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          {contact.username ? `@${contact.username}` : contact.ig_user_id}
        </h1>
        {contact.name && <span className="text-xs text-muted">{contact.name}</span>}
        <Badge tone={contact.windowOpen ? 'success' : 'neutral'}>
          {contact.windowOpen ? 'janela de 24h aberta' : 'janela fechada'}
        </Badge>
        {contact.automation_paused && <Badge tone="neutral">em atendimento humano</Badge>}
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <Card className="space-y-4 p-4">
              <SubscriptionToggle contactId={contact.id} subscribed={contact.subscribed} />
              <ContactTags contactId={contact.id} tags={contact.tags} />
              <ContactFields contactId={contact.id} fields={contact.fields} />

              <div className="border-t border-border pt-3">
                <DeleteContact
                  contactId={contact.id}
                  name={contact.username ? `@${contact.username}` : contact.ig_user_id}
                />
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Origem
              </p>
              {contact.source_type === 'comment' && contact.source_id ? (
                <div className="space-y-1">
                  <p className="text-xs">Comentou num post</p>
                  <Link
                    href={`/contatos?post=${contact.source_id}`}
                    className="block text-[11px] text-accent hover:underline"
                  >
                    ver todos que vieram deste post
                  </Link>
                  {contact.source_at && (
                    <p className="text-[11px] text-muted">
                      {new Date(contact.source_at).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted">
                  Não registrada. Só quem chega comentando tem origem — e apenas a partir de
                  30/07/2026, quando passamos a gravar.
                </p>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Fluxos que rodou
              </p>
              {runs.length === 0 ? (
                <p className="text-[11px] text-muted">Nenhum fluxo ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {runs.map((run) => (
                    <div key={run.id} className="flex items-center gap-2 text-[11px]">
                      <span className="truncate text-foreground">{run.flowName}</span>
                      <span className="ml-auto shrink-0 font-mono text-muted">
                        {RUN_LABEL[run.status] ?? run.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="flex max-h-[70vh] flex-col p-4">
            <div className="mb-3 flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Últimas mensagens
              </p>
              <Link href="/conversas" className="ml-auto">
                <Button size="sm" variant="outline">
                  Abrir no inbox
                </Button>
              </Link>
            </div>

            {messages.length === 0 ? (
              <p className="text-[11px] text-muted">Nenhuma mensagem trocada.</p>
            ) : (
              <div className="space-y-2 overflow-y-auto">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      message.direction === 'in' ? 'justify-start' : 'justify-end',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3 py-1.5',
                        message.direction === 'in'
                          ? 'bg-surface-2 text-foreground'
                          // Tinta escura sobre o accent — texto branco sobre laranja-cobre
                          // não bate 4.5:1 de contraste (WCAG AA); esta combinação bate ~6.8:1.
                          : 'bg-accent text-background',
                      )}
                    >
                      <p className="whitespace-pre-wrap text-xs">{message.text || '—'}</p>
                      <div
                        className={cn(
                          'mt-0.5 flex items-center gap-1 text-[10px]',
                          message.direction === 'in' ? 'text-muted' : 'text-background/70',
                        )}
                      >
                        {message.direction === 'out' &&
                          (message.source === 'manual' ? (
                            <User className="size-2.5" />
                          ) : (
                            <Bot className="size-2.5" />
                          ))}
                        <span>{new Date(message.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </>
  )
}
