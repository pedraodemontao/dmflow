'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Eraser, Loader2 } from 'lucide-react'

import { resetTestData } from '@/app/actions'
import { Button, Input } from '@/components/ui'

const CONFIRMACAO = 'APAGAR'

/**
 * Limpeza para recomeçar um teste. Exige digitar a palavra porque isto roda
 * na base de produção — o mesmo banco que atende os leads de verdade.
 */
export function ResetTeste({ total }: { total: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState('')
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Eraser className="size-4" />
        Limpar dados de teste
      </Button>
    )
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3">
      <p className="text-xs font-medium text-danger">
        Apagar {total} {total === 1 ? 'contato' : 'contatos'} e a fila de eventos
      </p>
      <p className="text-[11px] text-muted">
        Leva junto mensagens, conversas e métricas de fluxo. Automações, fluxos, atalhos e a
        conta conectada ficam intactos. Isto é a base de <strong>produção</strong> — se já
        houver lead real aqui, ele some também.
      </p>
      <div className="flex gap-2">
        <Input
          className="max-w-40"
          value={texto}
          placeholder={`digite ${CONFIRMACAO}`}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Button
          size="sm"
          variant="danger"
          disabled={pending || texto.trim().toUpperCase() !== CONFIRMACAO}
          onClick={() =>
            start(async () => {
              await resetTestData()
              setOpen(false)
              setTexto('')
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Apagar tudo'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setTexto('')
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
