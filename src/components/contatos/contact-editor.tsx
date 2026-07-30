'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import {
  removeContactField,
  saveContactField,
  setContactSubscribed,
  updateContactTags,
} from '@/app/actions'
import { Badge, Button, Input, Label } from '@/components/ui'

export function ContactTags({ contactId, tags }: { contactId: string; tags: string[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState('')

  function commit(next: string[]) {
    start(async () => {
      await updateContactTags(contactId, next)
      router.refresh()
    })
  }

  return (
    <div>
      <Label>Etiquetas</Label>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-[11px] text-muted">Nenhuma etiqueta</span>}
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            disabled={pending}
            title="Remover etiqueta"
            onClick={() => commit(tags.filter((t) => t !== tag))}
            className="group inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent"
          >
            {tag}
            <Trash2 className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          commit([...tags, draft])
          setDraft('')
        }}
      >
        <Input
          value={draft}
          placeholder="nova etiqueta"
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending || !draft.trim()}>
          <Plus className="size-3.5" />
        </Button>
      </form>
    </div>
  )
}

export function ContactFields({
  contactId,
  fields,
}: {
  contactId: string
  fields: Record<string, unknown>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const entries = Object.entries(fields)

  return (
    <div>
      <Label>Campos personalizados</Label>
      <div className="mb-2 space-y-1">
        {entries.length === 0 && (
          <span className="text-[11px] text-muted">
            Nenhum campo. O bloco “Gravar campo” do fluxo preenche isso sozinho.
          </span>
        )}
        {entries.map(([name, raw]) => (
          <div key={name} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-muted">{name}</span>
            <span className="ml-auto truncate text-xs">{String(raw)}</span>
            <button
              type="button"
              disabled={pending}
              title="Apagar campo"
              onClick={() =>
                start(async () => {
                  await removeContactField(contactId, name)
                  router.refresh()
                })
              }
              className="text-muted hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!key.trim()) return
          start(async () => {
            await saveContactField(contactId, key, value)
            setKey('')
            setValue('')
            router.refresh()
          })
        }}
      >
        <Input className="w-28" value={key} placeholder="campo" onChange={(e) => setKey(e.target.value)} />
        <Input value={value} placeholder="valor" onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" variant="outline" size="sm" disabled={pending || !key.trim()}>
          <Plus className="size-3.5" />
        </Button>
      </form>
    </div>
  )
}

export function SubscriptionToggle({
  contactId,
  subscribed,
}: {
  contactId: string
  subscribed: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <div className="flex items-center gap-3">
      <Badge tone={subscribed ? 'success' : 'warning'}>
        {subscribed ? 'recebe automação' : 'descadastrado'}
      </Badge>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setContactSubscribed(contactId, !subscribed)
            router.refresh()
          })
        }
      >
        {subscribed ? 'Descadastrar' : 'Reinscrever'}
      </Button>
    </div>
  )
}
