'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { BarChart3, Copy, Loader2, Pause, Play, Trash2 } from 'lucide-react'

import { deleteAutomation, duplicateAutomation, toggleAutomation } from '@/app/actions'
import { Button } from '@/components/ui'

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
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action()
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
          onClick={() => run(() => deleteAutomation(triggerId))}
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
        onClick={() => run(() => duplicateAutomation(triggerId))}
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
