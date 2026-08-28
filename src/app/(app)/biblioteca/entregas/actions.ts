'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { storedDeliverySchema } from '@/lib/ai/schemas'
import { DELIVERY_FILES_BUCKET } from '@/lib/delivery/file-url'
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
 * Valida contra `storedDeliverySchema`, que é o schema do modelo mais o bloco
 * de anexo: o conteúdo editado à mão passa pelas mesmas regras que o gerado,
 * senão a página pública viraria o lugar onde se descobre que um bloco ficou
 * sem texto.
 */
export async function updateDelivery(
  id: string,
  content: unknown,
): Promise<DeliveryActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Entrega inválida.' }

  const parsed = storedDeliverySchema.safeParse(content)
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

/**
 * Sobe o anexo da entrega e devolve o CAMINHO no bucket — nunca a URL, que é
 * montada na renderização (`src/lib/delivery/file-url.ts`).
 *
 * O caminho é derivado do id da entrega e de um nome higienizado; nada do que
 * o navegador manda entra nele cru. Nome de arquivo é dado de usuário, e dado
 * de usuário virando caminho de storage é travessia de diretório esperando
 * acontecer.
 *
 * Falha fechado: extensão fora da lista ou arquivo grande demais são recusados
 * ANTES do upload, porque o bucket é público — o que entra ali fica servido na
 * internet com a marca da conta.
 */
const EXTENSOES = ['pdf', 'xlsx', 'csv', 'docx', 'png', 'jpg', 'jpeg', 'zip'] as const
const TAMANHO_MAXIMO = 25 * 1024 * 1024

export interface UploadResult {
  ok: boolean
  error?: string
  path?: string
  sizeBytes?: number
}

export async function uploadDeliveryFile(
  deliveryId: string,
  formData: FormData,
): Promise<UploadResult> {
  if (!uuid.safeParse(deliveryId).success) return { ok: false, error: 'Entrega inválida.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Escolha um arquivo.' }
  }

  if (file.size > TAMANHO_MAXIMO) {
    return { ok: false, error: 'Arquivo maior que 25 MB.' }
  }

  const extensao = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(EXTENSOES as readonly string[]).includes(extensao)) {
    return { ok: false, error: `Extensão não aceita. Use: ${EXTENSOES.join(', ')}.` }
  }

  // Só o miolo do nome sobrevive, e mesmo assim higienizado. O que garante que
  // o caminho é seguro é ele ser CONSTRUÍDO aqui, não recebido.
  const base = file.name
    .slice(0, -(extensao.length + 1))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  const path = `${deliveryId}/${base || 'arquivo'}.${extensao}`

  const { error } = await supabaseAdmin.storage
    .from(DELIVERY_FILES_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })

  if (error) return { ok: false, error: `Falha ao subir: ${error.message}` }

  return { ok: true, path, sizeBytes: file.size }
}
