'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Eraser, Loader2 } from 'lucide-react'

import { resetTestData } from '@/app/actions'
import { Button, Input } from '@/components/ui'
import { useToast } from '@/components/ui/toast'

const CONFIRMACAO = 'APAGAR'

/**
 * Limpeza para recomeçar um teste. Exige digitar a palavra porque isto roda
 * na base de produção — o mesmo banco que atende os leads de verdade.
 *
 * A confirmação abre como `pop-panel` ancorado no botão, e não no lugar dele:
 * o gatilho vive dentro do cabeçalho de 64px de altura, e um painel de três
 * linhas trocando o botão ali dentro estourava a barra.
 */
export function ResetTeste({ total }: { total: number }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState('')
  const [pending, start] = useTransition()

  return (
    <div className="relative">
      <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
        <Eraser className="size-4" />
        Limpar dados de teste
      </Button>

      {open && (
        <div className="pop-panel absolute top-10 right-0 z-20 w-96 max-w-[calc(100vw-3rem)] space-y-3 rounded-md p-4">
          <p className="label text-[10px] text-danger">
            Apagar {total} {total === 1 ? 'contato' : 'contatos'} e a fila de eventos
          </p>
          <p className="text-xs leading-relaxed text-muted">
            Leva junto mensagens, conversas e métricas de fluxo. Automações, fluxos, atalhos e a
            conta conectada ficam intactos. Isto é a base de{' '}
            <strong className="text-foreground">produção</strong> — se já houver lead real aqui,
            ele some também.
          </p>
          <div className="flex gap-2">
            <Input
              className="max-w-40 font-mono"
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
                  const result = await resetTestData()
                  if (!result.ok) {
                    toast.error(result.error ?? 'Não consegui limpar os dados de teste.')
                    return
                  }
                  toast.success(
                    `${total} ${total === 1 ? 'contato apagado' : 'contatos apagados'} e fila de eventos limpa.`,
                  )
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
      )}
    </div>
  )
}
