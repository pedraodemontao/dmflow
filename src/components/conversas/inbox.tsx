'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Bot, Loader2, Send, User } from 'lucide-react'

import {
  fetchThread,
  markThreadRead,
  sendManualMessage,
  setContactAutomationPaused,
} from '@/app/actions'
import { Badge, Button, Textarea } from '@/components/ui'
import type { InboxItem, Thread } from '@/lib/data'
import { cn } from '@/lib/utils'

/** Atualiza a thread aberta sem recarregar a página. */
const POLL_MS = 15_000

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function displayName(contact: { username: string | null; name: string | null; ig_user_id: string }) {
  if (contact.username) return `@${contact.username}`
  if (contact.name) return contact.name
  return contact.ig_user_id.startsWith('comment_author:') ? 'via comentário' : contact.ig_user_id
}

export function Inbox({ items, initialThread }: { items: InboxItem[]; initialThread: Thread | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(initialThread?.contact.id ?? null)
  const [thread, setThread] = useState<Thread | null>(initialThread)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, startSending] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadThread(contactId: string) {
    const next = await fetchThread(contactId)
    if (next) setThread(next)
  }

  function openThread(contactId: string) {
    setSelectedId(contactId)
    setError(null)
    setThread(null)
    void loadThread(contactId)
    void markThreadRead(contactId)
  }

  useEffect(() => {
    if (!selectedId) return
    const id = setInterval(() => void loadThread(selectedId), POLL_MS)
    return () => clearInterval(id)
  }, [selectedId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.messages.length])

  function handleSend() {
    if (!selectedId || !draft.trim()) return
    const text = draft.trim()

    startSending(async () => {
      const result = await sendManualMessage(selectedId, text)
      if (!result.ok) {
        setError(result.error ?? 'Falha no envio')
        return
      }
      setDraft('')
      setError(null)
      await loadThread(selectedId)
    })
  }

  function handleTogglePause(paused: boolean) {
    if (!selectedId) return
    startSending(async () => {
      await setContactAutomationPaused(selectedId, paused)
      await loadThread(selectedId)
    })
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border">
        {items.map(({ contact, lastMessage }) => (
          <button
            key={contact.id}
            type="button"
            onClick={() => openThread(contact.id)}
            className={cn(
              'flex flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors',
              contact.id === selectedId ? 'bg-surface-2' : 'hover:bg-surface-2/60',
            )}
          >
            <div className="flex items-baseline gap-2">
              <span className="truncate text-xs font-medium">{displayName(contact)}</span>
              {contact.unread_count > 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
                  {contact.unread_count}
                </span>
              )}
              {lastMessage && (
                <span className={cn('shrink-0 text-[10px] text-muted', contact.unread_count > 0 && 'ml-0')}>
                  {timeAgo(lastMessage.created_at)}
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-muted">
              {lastMessage?.direction === 'out' && 'Você: '}
              {lastMessage?.text || 'sem texto'}
            </p>
          </button>
        ))}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
            Escolha uma conversa à esquerda para ler e responder.
          </div>
        ) : !thread ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted" />
          </div>
        ) : (
          <>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
              <span className="text-sm font-semibold">{displayName(thread.contact)}</span>
              {thread.contact.windowOpen ? (
                <Badge tone="success">janela de 24h aberta</Badge>
              ) : (
                <Badge tone="warning">janela fechada</Badge>
              )}
              {thread.contact.automation_paused && <Badge tone="neutral">automação pausada</Badge>}

              <div className="ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending}
                  onClick={() => handleTogglePause(!thread.contact.automation_paused)}
                >
                  {thread.contact.automation_paused ? 'Devolver ao robô' : 'Assumir conversa'}
                </Button>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {thread.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn('flex', message.direction === 'in' ? 'justify-start' : 'justify-end')}
                >
                  <div
                    className={cn(
                      'max-w-[70%] rounded-2xl px-3.5 py-2',
                      message.direction === 'in'
                        ? 'bg-surface-2 text-foreground'
                        : 'bg-accent text-white',
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm">{message.text || <em>sem texto</em>}</p>
                    <div
                      className={cn(
                        'mt-1 flex items-center gap-1 text-[10px]',
                        message.direction === 'in' ? 'text-muted' : 'text-white/70',
                      )}
                    >
                      {message.direction === 'out' &&
                        (message.source === 'manual' ? (
                          <User className="size-3" />
                        ) : (
                          <Bot className="size-3" />
                        ))}
                      <span>
                        {new Date(message.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <footer className="shrink-0 border-t border-border p-4">
              {!thread.contact.windowOpen && (
                <p className="mb-2 text-[11px] text-warning">
                  O Instagram só permite responder até 24h depois da última mensagem do contato.
                </p>
              )}
              {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}

              <div className="flex items-end gap-2">
                <Textarea
                  rows={2}
                  value={draft}
                  disabled={!thread.contact.windowOpen || sending}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={
                    thread.contact.windowOpen
                      ? 'Escreva a resposta. Enter envia, Shift+Enter quebra linha.'
                      : 'Janela fechada — espere o contato mandar mensagem.'
                  }
                />
                <Button
                  onClick={handleSend}
                  disabled={!thread.contact.windowOpen || sending || !draft.trim()}
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Responder aqui assume a conversa: a automação para de falar com este contato até
                você devolver ao robô.
              </p>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}
