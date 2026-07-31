'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, MessageSquarePlus, Plus, Trash2 } from 'lucide-react'

import { saveIceBreakers } from '@/app/actions'
import { Badge, Button, Card, Input, Label } from '@/components/ui'
import type { IceBreaker } from '@/types/db'

const MAX_ICE_BREAKERS = 4

/** Sugestão de payload a partir da pergunta — o dono pode sobrescrever. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function emptyRow(): IceBreaker {
  return { question: '', payload: '' }
}

export function IceBreakers({
  initial,
  syncedAt,
}: {
  initial: IceBreaker[]
  syncedAt: string | null
}) {
  const router = useRouter()
  const [items, setItems] = useState<IceBreaker[]>(initial.length ? initial : [emptyRow()])
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(syncedAt)

  function updateItem(index: number, patch: Partial<IceBreaker>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addItem() {
    if (items.length >= MAX_ICE_BREAKERS) return
    setItems((prev) => [...prev, emptyRow()])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function save() {
    setError(null)
    start(async () => {
      const clean = items
        .map((item) => ({ question: item.question.trim(), payload: item.payload.trim() }))
        .filter((item) => item.question || item.payload)

      const result = await saveIceBreakers(clean)
      if (!result.ok) {
        setError(result.error ?? 'Falhou')
        return
      }
      setSavedAt(new Date().toISOString())
      router.refresh()
    })
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <MessageSquarePlus className="mt-0.5 size-4 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Ice breakers</p>
          <p className="mt-1 text-[11px] text-muted">
            Perguntas fixas que a Meta mostra quando alguém abre o direct com a conta pela
            primeira vez. Até {MAX_ICE_BREAKERS}. Cada uma tem um payload — crie uma automação de
            &quot;palavra na DM&quot; com correspondência exata usando o mesmo payload como
            palavra-chave, para decidir o que acontece quando a pessoa tocar.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Label>Pergunta</Label>
              <Input
                value={item.question}
                maxLength={80}
                placeholder="Quanto custa?"
                disabled={pending}
                onChange={(e) => {
                  const question = e.target.value
                  // Só auto-preenche o payload enquanto ele ainda não foi editado à mão.
                  const shouldAutoSlug = !item.payload || item.payload === slugify(item.question)
                  updateItem(index, {
                    question,
                    ...(shouldAutoSlug ? { payload: slugify(question) } : {}),
                  })
                }}
              />
            </div>
            <div className="flex-1">
              <Label>Payload (palavra-chave da automação)</Label>
              <Input
                value={item.payload}
                maxLength={200}
                placeholder="QUANTO_CUSTA"
                disabled={pending}
                onChange={(e) => updateItem(index, { payload: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => removeItem(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        {items.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
            Nenhuma pergunta. Salvar assim remove o que estiver publicado na Meta.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || items.length >= MAX_ICE_BREAKERS}
          onClick={addItem}
        >
          <Plus className="size-4" />
          Adicionar pergunta
        </Button>

        <Button type="button" size="sm" disabled={pending} onClick={save} className="ml-auto">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar e publicar na Meta
        </Button>
      </div>

      {savedAt && (
        <Badge tone="success">publicado {new Date(savedAt).toLocaleString('pt-BR')}</Badge>
      )}

      {error && <p className="text-[11px] text-danger">{error}</p>}
    </Card>
  )
}
