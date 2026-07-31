'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Bot, Check, Clock, Loader2, Send, StickyNote, User, Users } from 'lucide-react'

import {
  fetchThread,
  markThreadRead,
  saveContactNotes,
  sendManualMessage,
  setContactAutomationPaused,
  setInboxStatus,
} from '@/app/actions'
import { CannedReplies } from '@/components/conversas/canned-replies'
import { Avatar, Badge, Button, Textarea } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import type { InboxFilter, InboxItem, Thread } from '@/lib/data'
import type { CannedReply } from '@/types/db'
import { cn } from '@/lib/utils'

const followerFormatter = new Intl.NumberFormat('pt-BR', { notation: 'compact' })

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'abertas', label: 'Abertas' },
  { key: 'nao-lidas', label: 'Não lidas' },
  { key: 'adiadas', label: 'Adiadas' },
  { key: 'resolvidas', label: 'Resolvidas' },
]

const SNOOZE_OPTIONS = [
  { hours: 1, label: '1 hora' },
  { hours: 4, label: '4 horas' },
  { hours: 24, label: 'Amanhã' },
]

/** A conversa sai da fila e some da lista — o aviso é a única prova do que aconteceu. */
const STATUS_TOAST: Record<'open' | 'done' | 'snoozed', string> = {
  open: 'Conversa reaberta.',
  done: 'Conversa resolvida.',
  snoozed: 'Conversa adiada.',
}

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

export function Inbox({
  items,
  initialThread,
  filter,
  counts,
  cannedReplies,
}: {
  items: InboxItem[]
  initialThread: Thread | null
  filter: InboxFilter
  counts: Record<InboxFilter, number>
  cannedReplies: CannedReply[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(initialThread?.contact.id ?? null)
  const [thread, setThread] = useState<Thread | null>(initialThread)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, startSending] = useTransition()
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadThread(contactId: string) {
    const next = await fetchThread(contactId)
    if (next) setThread(next)
  }

  function openThread(contactId: string) {
    setSelectedId(contactId)
    setError(null)
    setThread(null)
    setSnoozeOpen(false)
    setShowNotes(false)
    void loadThread(contactId)
    void markThreadRead(contactId)
  }

  function changeStatus(status: 'open' | 'done' | 'snoozed', hours?: number) {
    if (!selectedId) return
    setSnoozeOpen(false)
    startSending(async () => {
      const result = await setInboxStatus(selectedId, status, hours)
      if (!result.ok) {
        toast.error(result.error ?? 'Não consegui mudar o estado da conversa.')
        return
      }
      toast.success(STATUS_TOAST[status])
      // Sai da lista atual quando o filtro deixa de casar.
      setSelectedId(null)
      setThread(null)
      router.refresh()
    })
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
        // Fica nos dois lugares de propósito: o texto acima do compositor é o
        // que continua na tela enquanto a pessoa decide o que fazer; o toast é
        // o que ela vê sem tirar o olho de onde clicou.
        setError(result.error ?? 'Falha no envio')
        toast.error(result.error ?? 'Falha no envio')
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
      const result = await setContactAutomationPaused(selectedId, paused)
      if (!result.ok) {
        toast.error(result.error ?? 'Não consegui mudar quem responde este contato.')
        return
      }
      toast.success(
        paused
          ? 'Você assumiu a conversa — a automação parou para este contato.'
          : 'Conversa devolvida ao robô.',
      )
      await loadThread(selectedId)
    })
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 gap-1 border-b border-border p-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => router.push(key === 'abertas' ? '/conversas' : `/conversas?fila=${key}`)}
              className={cn(
                'flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors',
                key === filter
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted hover:bg-surface-2 hover:text-foreground',
              )}
            >
              {label}
              {counts[key] > 0 && <span className="ml-1 tabular-nums">{counts[key]}</span>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
        {items.map(({ contact, lastMessage }) => {
          const selected = contact.id === selectedId
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => openThread(contact.id)}
              className={cn(
                'flex w-full items-start gap-2.5 border-b border-l-2 border-border px-3.5 py-3 text-left transition-colors',
                selected
                  ? 'border-l-accent bg-accent/[0.08]'
                  : 'border-l-transparent hover:bg-surface-2/60',
              )}
            >
              <Avatar
                src={contact.profile_pic_url}
                label={displayName(contact)}
                verified={contact.is_verified}
                size="sm"
                className="mt-0.5"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {displayName(contact)}
                  </span>
                  {contact.follower_count != null && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted">
                      <Users className="size-2.5" />
                      {followerFormatter.format(contact.follower_count)}
                    </span>
                  )}
                  {lastMessage && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted">
                      {timeAgo(lastMessage.created_at)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
                    {lastMessage?.direction === 'out' && 'Você: '}
                    {lastMessage?.text || 'sem texto'}
                  </p>
                  {contact.unread_count > 0 && (
                    // Tinta escura sobre o accent — texto branco não bate 4.5:1 (WCAG AA).
                    <span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-background">
                      {contact.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
          })}

          {items.length === 0 && (
            <p className="p-4 text-center text-[11px] text-muted">
              Nada nesta fila.
            </p>
          )}
        </div>
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
            <header className="chrome-panel flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5">
              <Avatar
                src={thread.contact.profile_pic_url}
                label={displayName(thread.contact)}
                verified={thread.contact.is_verified}
                size="sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName(thread.contact)}</p>
                {thread.contact.follower_count != null && (
                  <p className="flex items-center gap-1 text-[10px] text-muted">
                    <Users className="size-2.5" />
                    {followerFormatter.format(thread.contact.follower_count)} seguidores
                  </p>
                )}
              </div>
              {thread.contact.windowOpen ? (
                <Badge tone="success">janela de 24h aberta</Badge>
              ) : (
                <Badge tone="warning">janela fechada</Badge>
              )}
              {thread.contact.automation_paused && <Badge tone="neutral">automação pausada</Badge>}
              {thread.contact.inbox_status === 'done' && <Badge tone="success">resolvida</Badge>}

              <div className="relative ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  title="Anotações internas"
                  onClick={() => {
                    // Carrega ao abrir, para não sobrescrever o que está sendo digitado.
                    if (!showNotes) setNotes(thread.contact.notes ?? '')
                    setShowNotes(!showNotes)
                  }}
                >
                  <StickyNote
                    className={cn('size-4', thread.contact.notes && 'text-accent')}
                  />
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  title="Adiar"
                  disabled={sending}
                  onClick={() => setSnoozeOpen((open) => !open)}
                >
                  <Clock className="size-4" />
                </Button>

                {snoozeOpen && (
                  <div className="pop-panel absolute right-0 top-9 z-10 w-36 overflow-hidden rounded-2xl">
                    {SNOOZE_OPTIONS.map((option) => (
                      <button
                        key={option.hours}
                        type="button"
                        onClick={() => changeStatus('snoozed', option.hours)}
                        className="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending}
                  onClick={() => handleTogglePause(!thread.contact.automation_paused)}
                >
                  {thread.contact.automation_paused ? 'Devolver ao robô' : 'Assumir'}
                </Button>

                <Button
                  size="sm"
                  disabled={sending}
                  onClick={() =>
                    changeStatus(thread.contact.inbox_status === 'done' ? 'open' : 'done')
                  }
                >
                  <Check className="size-4" />
                  {thread.contact.inbox_status === 'done' ? 'Reabrir' : 'Resolver'}
                </Button>
              </div>
            </header>

            {showNotes && (
              <div className="shrink-0 border-b border-border bg-surface-2/50 p-3">
                <Textarea
                  rows={2}
                  value={notes}
                  placeholder="Anotações internas — o contato nunca vê isso."
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sending}
                    onClick={() =>
                      startSending(async () => {
                        const result = await saveContactNotes(thread.contact.id, notes)
                        if (!result.ok) {
                          toast.error(result.error ?? 'Não consegui salvar a nota.')
                          return
                        }
                        toast.success('Nota salva.')
                        await loadThread(thread.contact.id)
                      })
                    }
                  >
                    Salvar nota
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNotes(false)}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {thread.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn('flex', message.direction === 'in' ? 'justify-start' : 'justify-end')}
                >
                  <div
                    className={cn(
                      'max-w-[70%] rounded-2xl px-3.5 py-2 shadow-[0_6px_16px_-10px_rgb(0_0_0_/70%)]',
                      message.direction === 'in'
                        ? 'bg-surface-2 text-foreground'
                        : // Tinta escura sobre o accent — texto branco não bate 4.5:1 (WCAG AA);
                          // esta combinação bate ~6.8:1 (mesma regra do balão em contatos/[id]).
                          'bg-gradient-to-b from-accent to-accent-soft text-background',
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm">{message.text || <em>sem texto</em>}</p>
                    <div
                      className={cn(
                        'mt-1 flex items-center gap-1 text-[10px]',
                        message.direction === 'in' ? 'text-muted' : 'text-background/70',
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
                <CannedReplies
                  replies={cannedReplies}
                  draft={draft}
                  onPick={(text) => setDraft((current) => (current.trim() ? `${current} ${text}` : text))}
                />
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
