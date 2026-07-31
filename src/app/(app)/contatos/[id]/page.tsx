import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Bot, User } from 'lucide-react'

import {
  ContactFields,
  ContactTags,
  DeleteContact,
  SubscriptionToggle,
} from '@/components/contatos/contact-editor'
import { WindowBadge } from '@/components/shared/window-badge'
import { Avatar, Badge, Button, Card } from '@/components/ui'
import { BigNumber } from '@/components/ui/chart'
import { getContactDetail } from '@/lib/data'
import { cn } from '@/lib/utils'

const followerFormatter = new Intl.NumberFormat('pt-BR', { notation: 'compact' })

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
  const label = contact.username ? `@${contact.username}` : contact.ig_user_id

  return (
    <>
      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        {/* O `Link` é o elemento focável, então o anel vive nele — o `Button`
            aqui é só a casca visual e nunca recebe foco. */}
        <Link
          href="/contatos"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <Button variant="ghost" size="sm" aria-label="Voltar para contatos" tabIndex={-1}>
            <ArrowLeft className="size-4" />
          </Button>
        </Link>

        <Avatar src={contact.profile_pic_url} label={label} verified={contact.is_verified} size="sm" />

        <div className="min-w-0">
          <h1 className="display truncate text-4xl text-foreground">{label}</h1>
          {contact.name && <p className="truncate text-xs text-muted">{contact.name}</p>}
        </div>

        <WindowBadge open={contact.windowOpen} />
        {contact.automation_paused && <Badge tone="neutral">em atendimento humano</Badge>}
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            {/*
              O único número desta tela merece a voz de número: em texto
              corrido, "12 mil seguidores" sumia na mesma linha cinza do nome.
              Mesmo vocabulário do painel (`BigNumber`), não uma tipografia
              inventada aqui.
            */}
            {contact.follower_count != null && (
              <Card className="p-4">
                <BigNumber
                  value={followerFormatter.format(contact.follower_count)}
                  label="Seguidores"
                  hint="Número do perfil no momento da última sincronização."
                />
              </Card>
            )}

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
              <p className="label mb-2 text-[10px] text-muted">Origem</p>
              {contact.source_type === 'comment' && contact.source_id ? (
                <div className="space-y-1.5">
                  <p className="text-sm">Comentou num post</p>
                  <Link
                    href={`/contatos?post=${contact.source_id}`}
                    className="label block rounded-sm text-[10px] text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    ver todos deste post
                  </Link>
                  {contact.source_at && (
                    <p className="font-mono text-xs text-muted tabular-nums">
                      {new Date(contact.source_at).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-muted">
                  Não registrada. Só quem chega comentando tem origem — e apenas a partir de
                  30/07/2026, quando passamos a gravar.
                </p>
              )}
            </Card>

            <Card className="p-4">
              <p className="label mb-2 text-[10px] text-muted">Fluxos que rodou</p>
              {runs.length === 0 ? (
                <p className="text-xs text-muted">Nenhum fluxo ainda.</p>
              ) : (
                <div className="divide-y divide-border">
                  {runs.map((run) => (
                    <div key={run.id} className="flex items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
                      <span className="truncate text-foreground">{run.flowName}</span>
                      <span className="label ml-auto shrink-0 text-[9px] text-muted">
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
              <p className="label text-[10px] text-muted">Últimas mensagens</p>
              <Link
                href="/conversas"
                className="ml-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <Button size="sm" variant="outline" tabIndex={-1}>
                  Abrir no inbox
                </Button>
              </Link>
            </div>

            {messages.length === 0 ? (
              <p className="text-xs text-muted">Nenhuma mensagem trocada.</p>
            ) : (
              // Mesma gramática do inbox, em escala menor: recebida à esquerda
              // e cheia, enviada à direita e vazada, canto duro apontando para
              // quem falou. Ver o comentário longo em `components/conversas/inbox.tsx`.
              <div className="space-y-2.5 overflow-y-auto">
                {messages.map((message) => {
                  const incoming = message.direction === 'in'
                  return (
                    <div key={message.id} className={cn('flex', incoming ? 'justify-start' : 'justify-end')}>
                      <div
                        className={cn(
                          'max-w-[75%] rounded-md border px-3 py-2',
                          incoming
                            ? 'rounded-tl-none border-border bg-surface-2'
                            : 'rounded-tr-none border-muted bg-transparent',
                        )}
                      >
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {message.text || <em className="text-muted">sem texto</em>}
                        </p>
                        <div className="label mt-1.5 flex items-center gap-1.5 text-[9px] text-muted">
                          {!incoming &&
                            (message.source === 'manual' ? (
                              <User className="size-2.5" />
                            ) : (
                              <Bot className="size-2.5" />
                            ))}
                          {!incoming && <span>{message.source === 'manual' ? 'você' : 'robô'}</span>}
                          <span className="tabular-nums">
                            {new Date(message.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </main>
    </>
  )
}
