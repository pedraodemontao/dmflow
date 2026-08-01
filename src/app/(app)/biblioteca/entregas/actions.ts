'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Mutações de entrega. Mesma ressalva de `queries.ts`: nasce aqui, e não em
 * `src/app/actions.ts`, para não disputar linha com o agente que está na
 * área de métricas de automação.
 */

export interface DeliveryActionResult {
  ok: boolean
  error?: string
}

const uuid = z.string().uuid()

/**
 * Rascunho → publicada. Só nesse sentido: despublicar não é o card, e um
 * link já circulando em DM não pode virar 404 por engano de um clique.
 */
export async function publishDelivery(id: string): Promise<DeliveryActionResult> {
  const parsed = uuid.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Entrega inválida.' }

  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', parsed.data)
    .eq('status', 'draft')

  if (error) return { ok: false, error: error.message }

  revalidatePath('/biblioteca/entregas')
  revalidatePath('/biblioteca')
  return { ok: true }
}

/**
 * Liga ou desliga a entrega que `{{presente}}` interpola numa automação.
 * Mutação própria, fora do `saveAutomation` grande: trocar a entrega é uma
 * escolha que se salva na hora, como marcar "assistido" na biblioteca — não
 * precisa esperar o botão "Salvar" do resto do formulário.
 */
export async function setFlowDelivery(
  flowId: string,
  deliveryId: string | null,
): Promise<DeliveryActionResult> {
  if (!uuid.safeParse(flowId).success) return { ok: false, error: 'Automação inválida.' }
  if (deliveryId !== null && !uuid.safeParse(deliveryId).success) {
    return { ok: false, error: 'Entrega inválida.' }
  }

  const { error } = await supabaseAdmin
    .from('flows')
    .update({ delivery_id: deliveryId })
    .eq('id', flowId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/automacoes')
  return { ok: true }
}
