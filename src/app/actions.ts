'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { flowDefinitionSchema } from '@/lib/flow/types'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAccount } from '@/lib/data'

const automationSchema = z.object({
  triggerId: z.string().uuid().nullish(),
  name: z.string().min(1, 'Dê um nome para a automação'),
  triggerType: z.enum(['comment', 'keyword', 'story_reply', 'default']),
  keywords: z.array(z.string().min(1)),
  matchMode: z.enum(['exact', 'contains', 'starts_with']),
  mediaId: z.string().nullish(),
  publicReply: z.string().nullish(),
  isActive: z.boolean(),
  definition: flowDefinitionSchema,
})

export type AutomationInput = z.infer<typeof automationSchema>

export interface ActionResult {
  ok: boolean
  error?: string
  triggerId?: string
}

export async function saveAutomation(raw: unknown): Promise<ActionResult> {
  const parsed = automationSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }
  const input = parsed.data

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  // Gatilho de comentário sem keyword dispararia em qualquer comentário do post.
  if (input.triggerType !== 'default' && input.keywords.length === 0) {
    return { ok: false, error: 'Adicione ao menos uma palavra-chave.' }
  }

  try {
    let flowId: string

    if (input.triggerId) {
      const { data: existing } = await supabaseAdmin
        .from('triggers')
        .select('flow_id')
        .eq('id', input.triggerId)
        .single()

      if (!existing) return { ok: false, error: 'Automação não encontrada.' }
      flowId = existing.flow_id

      const { error } = await supabaseAdmin
        .from('flows')
        .update({
          name: input.name,
          definition: input.definition,
          is_active: input.isActive,
        })
        .eq('id', flowId)

      if (error) throw new Error(error.message)
    } else {
      const { data: flow, error } = await supabaseAdmin
        .from('flows')
        .insert({
          account_id: account.id,
          name: input.name,
          definition: input.definition,
          is_active: input.isActive,
        })
        .select('id')
        .single()

      if (error || !flow) throw new Error(error?.message ?? 'Falha ao criar fluxo')
      flowId = flow.id
    }

    const triggerRow = {
      account_id: account.id,
      flow_id: flowId,
      type: input.triggerType,
      keywords: input.keywords,
      match_mode: input.matchMode,
      media_id: input.mediaId || null,
      public_reply: input.publicReply || null,
      is_active: input.isActive,
    }

    const { data: trigger, error: triggerError } = input.triggerId
      ? await supabaseAdmin
          .from('triggers')
          .update(triggerRow)
          .eq('id', input.triggerId)
          .select('id')
          .single()
      : await supabaseAdmin.from('triggers').insert(triggerRow).select('id').single()

    if (triggerError || !trigger) throw new Error(triggerError?.message ?? 'Falha ao salvar gatilho')

    revalidatePath('/')
    revalidatePath('/automacoes')
    return { ok: true, triggerId: trigger.id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }
  }
}

export async function toggleAutomation(triggerId: string, isActive: boolean): Promise<ActionResult> {
  const { data: trigger } = await supabaseAdmin
    .from('triggers')
    .select('flow_id')
    .eq('id', triggerId)
    .maybeSingle()

  if (!trigger) return { ok: false, error: 'Automação não encontrada.' }

  await Promise.all([
    supabaseAdmin.from('triggers').update({ is_active: isActive }).eq('id', triggerId),
    supabaseAdmin.from('flows').update({ is_active: isActive }).eq('id', trigger.flow_id),
  ])

  revalidatePath('/')
  revalidatePath('/automacoes')
  return { ok: true }
}

export async function deleteAutomation(triggerId: string): Promise<ActionResult> {
  const { data: trigger } = await supabaseAdmin
    .from('triggers')
    .select('flow_id')
    .eq('id', triggerId)
    .maybeSingle()

  if (!trigger) return { ok: false, error: 'Automação não encontrada.' }

  // O flow leva os triggers e flow_runs junto por cascade.
  await supabaseAdmin.from('flows').delete().eq('id', trigger.flow_id)

  revalidatePath('/')
  revalidatePath('/automacoes')
  return { ok: true }
}
