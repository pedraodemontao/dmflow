'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { deliverySchema } from '@/lib/ai/schemas'
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
 * Ajustar o que o modelo escreveu, sem pagar outra geração.
 *
 * Antes disso as opções eram publicar como veio ou gerar de novo — e gerar de
 * novo é uma chamada paga que devolve um texto DIFERENTE, não o mesmo texto
 * corrigido. Para material que vai ser lido por lead, quase sempre falta só um
 * ajuste de tom, um número certo ou um nome próprio; refazer tudo por causa
 * disso é caro e não converge.
 *
 * Valida contra o MESMO schema que o modelo preenche (`deliverySchema`): o
 * conteúdo editado à mão passa pelas mesmas regras que o gerado, senão a
 * página pública viraria o lugar onde se descobre que um bloco ficou sem
 * texto.
 */
export async function updateDelivery(
  id: string,
  content: unknown,
): Promise<DeliveryActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Entrega inválida.' }

  const parsed = deliverySchema.safeParse(content)
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0]
    return {
      ok: false,
      error: primeiro
        ? `${primeiro.path.join('.') || 'conteúdo'}: ${primeiro.message}`
        : 'Conteúdo inválido.',
    }
  }

  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({
      title: parsed.data.title,
      subtitle: parsed.data.subtitle ?? null,
      blocks: parsed.data.blocks,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  // Publicada também é editável: corrigir um erro de digitação num material
  // que já está circulando é mais urgente que num rascunho, não menos. A rota
  // pública lê do banco a cada visita, então a correção vale na hora.
  revalidatePath('/biblioteca/entregas')
  revalidatePath('/e', 'layout')
  return { ok: true }
}

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
