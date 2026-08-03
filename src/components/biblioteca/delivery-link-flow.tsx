'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Link2 } from 'lucide-react'

import { setFlowDelivery } from '@/app/(app)/biblioteca/entregas/actions'
import type { FlowTarget } from '@/app/(app)/biblioteca/entregas/queries'
import { Select } from '@/components/ui'

/**
 * Ligar esta entrega a uma automação sem sair da aba.
 *
 * Antes disso, vincular exigia três passos e um conhecimento que só quem
 * construiu tinha: abrir a automação, achar o seletor no canto do canvas, e
 * saber que a variável se chama `{{presente}}`. O caminho existia e ninguém
 * percorria — as quatro automações continuaram mandando link cru.
 *
 * O aviso de `{{presente}}` faltando é a parte que evita o falso alívio:
 * vincular é metade do trabalho, e sem a variável no texto do fluxo a DM
 * continua saindo exatamente como antes.
 */
export function DeliveryLinkFlow({
  deliveryId,
  flows,
}: {
  deliveryId: string
  flows: FlowTarget[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const vinculada = flows.filter((f) => f.deliveryId === deliveryId)
  const semPresente = vinculada.filter((f) => !f.usesPresente)

  if (flows.length === 0) return null

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="label mb-1.5 flex items-center gap-1.5 text-[10px] text-muted">
        <Link2 className="size-3" />
        Usar esta entrega em
      </p>

      <Select
        value=""
        disabled={pending}
        onChange={(e) => {
          const flowId = e.target.value
          if (!flowId) return
          start(async () => {
            await setFlowDelivery(flowId, deliveryId)
            router.refresh()
          })
        }}
      >
        <option value="">escolher automação…</option>
        {flows
          .filter((f) => f.deliveryId !== deliveryId)
          .map((f) => (
            <option key={f.flowId} value={f.flowId}>
              {f.name}
              {f.isActive ? '' : ' (pausada)'}
              {f.usesPresente ? '' : ' — sem {{presente}} no texto'}
            </option>
          ))}
      </Select>

      {vinculada.length > 0 && (
        <ul className="mt-2 space-y-1">
          {vinculada.map((f) => (
            <li key={f.flowId} className="flex items-center gap-2 text-[11px]">
              <span className="flex-1 truncate text-foreground">{f.name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await setFlowDelivery(f.flowId, null)
                    router.refresh()
                  })
                }
                className="label text-[9px] text-muted hover:text-danger"
              >
                desvincular
              </button>
            </li>
          ))}
        </ul>
      )}

      {semPresente.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-warning">
          {semPresente.length === 1 ? 'A automação' : 'As automações'}{' '}
          <span className="text-foreground">{semPresente.map((f) => f.name).join(', ')}</span>{' '}
          {semPresente.length === 1 ? 'está vinculada' : 'estão vinculadas'} mas não{' '}
          {semPresente.length === 1 ? 'escreve' : 'escrevem'}{' '}
          <code className="text-foreground">{'{{presente}}'}</code> em bloco nenhum — a DM continua
          mandando o que mandava antes. Abra a automação e troque o link pelo{' '}
          <code className="text-foreground">{'{{presente}}'}</code>.
        </p>
      )}
    </div>
  )
}
