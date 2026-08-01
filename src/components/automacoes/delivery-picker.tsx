'use client'

import { useTransition } from 'react'
import { Gift } from 'lucide-react'

import { setFlowDelivery } from '@/app/(app)/biblioteca/entregas/actions'
import type { DeliveryOption } from '@/app/(app)/biblioteca/entregas/queries'
import { Select } from '@/components/ui'

/**
 * Qual entrega o `{{presente}}` desta automação manda.
 *
 * Salva no ato, sem esperar o "Salvar" do formulário: é uma escolha só, e
 * deixá-la presa ao save grande faria o aviso de vazamento (`{{presente}}` sem
 * entrega vinculada) continuar aceso mesmo depois de resolvido, porque ele lê
 * o estado local.
 *
 * Rascunho aparece na lista, mas marcado. Vincular rascunho é legítimo — o
 * dono pode montar o fluxo antes de publicar o material — só não pode passar
 * despercebido, porque `/e/[slug]` responde 404 enquanto não for publicada,
 * e aí a DM leva o lead para um link morto. É exatamente o bug da automação
 * `mapa` que esta feature nasceu para matar.
 */
export function DeliveryPicker({
  flowId,
  options,
  value,
  onChange,
}: {
  flowId: string
  options: DeliveryOption[]
  value: string | null
  onChange: (next: string | null) => void
}) {
  const [pending, start] = useTransition()

  const escolhida = options.find((o) => o.id === value)
  const rascunho = escolhida?.status === 'draft'

  return (
    <div className="border-t border-border p-3">
      <p className="label mb-1.5 flex items-center gap-1.5 text-[10px] text-muted">
        <Gift className="size-3" />
        Presente que <code className="text-foreground">{'{{presente}}'}</code> manda
      </p>

      <Select
        value={value ?? ''}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value || null
          onChange(next)
          start(async () => {
            await setFlowDelivery(flowId, next)
          })
        }}
      >
        <option value="">nenhuma</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
            {o.status === 'draft' ? ' (rascunho)' : ''}
          </option>
        ))}
      </Select>

      {options.length === 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          Nenhuma entrega ainda. Gere um roteiro na biblioteca — o material que ele promete nasce
          junto.
        </p>
      )}

      {rascunho && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-warning">
          Esta entrega ainda é rascunho: o link responde 404 até você publicar.
        </p>
      )}
    </div>
  )
}
