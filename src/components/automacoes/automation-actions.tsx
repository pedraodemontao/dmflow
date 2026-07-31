'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { BarChart3, Copy, Loader2, Pause, Play, Trash2 } from 'lucide-react'

import { deleteAutomation, duplicateAutomation, toggleAutomation } from '@/app/actions'
import type { ActionResult } from '@/app/actions'
import { Button } from '@/components/ui'
import { useToast } from '@/components/ui/toast'

export function AutomationActions({
  triggerId,
  name,
  isActive,
}: {
  triggerId: string
  name: string
  isActive: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  /** `success` só onde a lista não conta a história sozinha. */
  function run(action: () => Promise<ActionResult>, success?: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? 'Não consegui completar a ação.')
        return
      }
      if (success) toast.success(success)
      router.refresh()
    })
  }

  if (confirmingDelete) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] text-muted">Apagar “{name}”?</span>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => run(() => deleteAutomation(triggerId), `“${name}” foi apagada.`)}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Apagar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
          Cancelar
        </Button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link href={`/automacoes/${triggerId}/metricas`}>
        <Button size="sm" variant="ghost" title="Ver métricas do fluxo">
          <BarChart3 className="size-4" />
        </Button>
      </Link>
      <Button
        size="sm"
        variant="ghost"
        title={isActive ? 'Pausar automação' : 'Ativar automação'}
        disabled={pending}
        onClick={() => run(() => toggleAutomation(triggerId, !isActive))}
      >
        {isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        title="Duplicar (a cópia nasce pausada)"
        disabled={pending}
        onClick={() => run(() => duplicateAutomation(triggerId), 'Cópia criada — ela nasce pausada.')}
      >
        <Copy className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        title="Apagar"
        disabled={pending}
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
