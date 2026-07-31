'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus, Trash2, Zap } from 'lucide-react'

import { createCannedReply, deleteCannedReply } from '@/app/actions'
import { Button, Input, Textarea } from '@/components/ui'
import type { CannedReply } from '@/types/db'

/**
 * Atalhos de resposta. Insere o texto no rascunho em vez de enviar direto —
 * quase sempre o atendente quer ajustar uma palavra antes de mandar.
 */
export function CannedReplies({
  replies,
  draft,
  onPick,
}: {
  replies: CannedReply[]
  draft: string
  onPick: (text: string) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [pending, start] = useTransition()

  function close() {
    setOpen(false)
    setCreating(false)
    setTitle('')
    setText('')
  }

  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        title="Respostas prontas"
        onClick={() => setOpen((value) => !value)}
      >
        <Zap className="size-4" />
      </Button>

      {open && (
        <div className="absolute bottom-10 left-0 z-20 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {creating ? (
            <div className="space-y-2 p-3">
              <Input
                value={title}
                placeholder="Nome do atalho"
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                rows={3}
                value={text}
                placeholder="Texto que será inserido"
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending || !title.trim() || !text.trim()}
                  onClick={() =>
                    start(async () => {
                      await createCannedReply(title, text)
                      close()
                      router.refresh()
                    })
                  }
                >
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto">
                {replies.length === 0 && (
                  <p className="p-3 text-[11px] text-muted">
                    Nenhum atalho ainda. Escreva uma resposta que você repete sempre e salve aqui.
                  </p>
                )}

                {replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="group flex items-start gap-2 border-b border-border p-2.5 last:border-0"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        onPick(reply.text)
                        close()
                      }}
                    >
                      <p className="truncate text-xs font-medium">{reply.title}</p>
                      <p className="truncate text-[11px] text-muted">{reply.text}</p>
                    </button>
                    <button
                      type="button"
                      title="Apagar atalho"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await deleteCannedReply(reply.id)
                          router.refresh()
                        })
                      }
                      className="shrink-0 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setCreating(true)
                  // O que já está escrito vira o ponto de partida do atalho.
                  setText(draft)
                }}
                className="flex w-full items-center gap-1.5 border-t border-border p-2.5 text-[11px] text-accent hover:bg-surface-2"
              >
                <Plus className="size-3.5" />
                {draft.trim() ? 'Salvar o que escrevi como atalho' : 'Novo atalho'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
