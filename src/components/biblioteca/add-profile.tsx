'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'

import { addTrackedProfile } from '@/app/(app)/biblioteca/actions'
import { Button, Input } from '@/components/ui'
import { useToast } from '@/components/ui/toast'

/**
 * O primeiro perfil de referência.
 *
 * Mora dentro do estado vazio de propósito: um estado vazio que só explica é
 * um beco sem saída, e o único caminho para a biblioteca deixar de estar vazia
 * é ter de quem raspar. Não é a tela de gestão de perfis (essa é outra
 * entrega) — é a saída do beco.
 */
export function AddProfile() {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [username, setUsername] = useState('')

  return (
    <form
      className="flex w-full max-w-sm gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!username.trim()) return

        start(async () => {
          const result = await addTrackedProfile(username)
          if (!result.ok) {
            toast.error(result.error ?? 'Não consegui adicionar o perfil.')
            return
          }
          toast.success('Perfil adicionado. A próxima raspagem começa por ele.')
          setUsername('')
          router.refresh()
        })
      }}
    >
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="@perfil do nicho"
        aria-label="Perfil do Instagram para acompanhar"
        disabled={pending}
      />
      <Button type="submit" variant="primary" className="cta-signature shrink-0" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Adicionar
      </Button>
    </form>
  )
}
