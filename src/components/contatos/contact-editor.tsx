'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'

import {
  deleteContact,
  removeContactField,
  saveContactField,
  setContactSubscribed,
  updateContactTags,
} from '@/app/actions'
import { Badge, Button, Input, Label } from '@/components/ui'
import { useToast } from '@/components/ui/toast'

export function ContactTags({ contactId, tags }: { contactId: string; tags: string[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState('')

  function commit(next: string[]) {
    start(async () => {
      const result = await updateContactTags(contactId, next)
      if (!result.ok) {
        toast.error(result.error ?? 'Não consegui salvar as etiquetas.')
        return
      }
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
  const toast = useToast()
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
                  const result = await removeContactField(contactId, name)
                  if (!result.ok) {
                    toast.error(result.error ?? 'Não consegui apagar o campo.')
                    return
                  }
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
            const result = await saveContactField(contactId, key, value)
            if (!result.ok) {
              toast.error(result.error ?? 'Não consegui salvar o campo.')
              return
            }
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

export function DeleteContact({ contactId, name }: { contactId: string; name: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        <Trash2 className="size-3.5" />
        Apagar contato
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-2xl border border-danger/40 bg-danger/10 p-3">
      <p className="text-[11px] text-muted">
        Apagar <span className="font-medium text-foreground">{name}</span> leva junto todo o
        histórico de mensagens e os fluxos que ele rodou. Não tem como desfazer.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await deleteContact(contactId)
              if (!result.ok) {
                toast.error(result.error ?? 'Não consegui apagar o contato.')
                return
              }
              // A tela some junto com o contato — sem o aviso, some sem dizer nada.
              toast.success(`${name} foi apagado.`)
              router.push('/contatos')
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Apagar mesmo assim'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
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
  const toast = useToast()
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
            const result = await setContactSubscribed(contactId, !subscribed)
            if (!result.ok) {
              toast.error(result.error ?? 'Não consegui mudar a inscrição.')
              return
            }
            router.refresh()
          })
        }
      >
        {subscribed ? 'Descadastrar' : 'Reinscrever'}
      </Button>
    </div>
  )
}
