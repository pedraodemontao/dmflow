'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { flowDefinitionSchema } from '@/lib/flow/types'
import { assertUnderSendCap, logSend } from '@/lib/flow/send-cap'
import { sendText } from '@/lib/instagram/api'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAccount, getThread, type Thread } from '@/lib/data'
import type { Contact } from '@/types/db'

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

const DM_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Resposta escrita por uma pessoa no inbox. Só passa dentro da janela de 24h —
 * fora dela a Meta recusa e a conta leva a culpa. Responder pausa a automação
 * do contato para o fluxo não falar por cima do atendimento.
 */
export async function sendManualMessage(contactId: string, text: string): Promise<ActionResult> {
  const clean = text.trim()
  if (!clean) return { ok: false, error: 'Escreva alguma coisa antes de enviar.' }
  if (clean.length > 1000) return { ok: false, error: 'Mensagem muito longa (máximo 1000).' }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  const { data } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .maybeSingle()

  const contact = data as Contact | null
  if (!contact) return { ok: false, error: 'Contato não encontrado.' }

  const windowOpen =
    contact.last_inbound_at &&
    Date.now() - new Date(contact.last_inbound_at).getTime() < DM_WINDOW_MS

  if (!windowOpen) {
    return {
      ok: false,
      error:
        'Janela de 24h fechada. O Instagram só deixa responder até 24h depois da última mensagem do contato.',
    }
  }

  try {
    await assertUnderSendCap(account.id)
    await sendText({
      igUserId: account.ig_user_id,
      accessToken: account.access_token,
      recipientId: contact.ig_user_id,
      text: clean,
    })
    await logSend(account.id, 'dm')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha no envio' }
  }

  await supabaseAdmin.from('messages').insert({
    account_id: account.id,
    contact_id: contact.id,
    direction: 'out',
    text: clean,
    source: 'manual',
  })

  // Assumir a conversa: o fluxo para de responder a este contato.
  await supabaseAdmin
    .from('contacts')
    .update({ automation_paused: true, unread_count: 0 })
    .eq('id', contact.id)

  revalidatePath('/conversas')
  return { ok: true }
}

/** Releitura da thread aberta no inbox (polling e pós-envio). */
export async function fetchThread(contactId: string): Promise<Thread | null> {
  return getThread(contactId)
}

export async function setContactAutomationPaused(
  contactId: string,
  paused: boolean,
): Promise<ActionResult> {
  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ automation_paused: paused })
    .eq('id', contactId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/conversas')
  return { ok: true }
}

export async function markThreadRead(contactId: string): Promise<ActionResult> {
  await supabaseAdmin.from('contacts').update({ unread_count: 0 }).eq('id', contactId)
  revalidatePath('/conversas')
  return { ok: true }
}

export async function duplicateAutomation(triggerId: string): Promise<ActionResult> {
  const { data: trigger } = await supabaseAdmin
    .from('triggers')
    .select('*')
    .eq('id', triggerId)
    .maybeSingle()

  if (!trigger) return { ok: false, error: 'Automação não encontrada.' }

  const { data: flow } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('id', trigger.flow_id)
    .maybeSingle()

  if (!flow) return { ok: false, error: 'Fluxo não encontrado.' }

  const { data: newFlow, error: flowError } = await supabaseAdmin
    .from('flows')
    .insert({
      account_id: flow.account_id,
      name: `${flow.name} (cópia)`,
      definition: flow.definition,
      // A cópia nasce desligada: ninguém quer dois fluxos iguais disparando.
      is_active: false,
    })
    .select('id')
    .single()

  if (flowError || !newFlow) return { ok: false, error: flowError?.message ?? 'Falha ao copiar' }

  const { data: newTrigger, error: triggerError } = await supabaseAdmin
    .from('triggers')
    .insert({
      account_id: trigger.account_id,
      flow_id: newFlow.id,
      type: trigger.type,
      keywords: trigger.keywords,
      match_mode: trigger.match_mode,
      media_id: trigger.media_id,
      public_reply: trigger.public_reply,
      is_active: false,
    })
    .select('id')
    .single()

  if (triggerError || !newTrigger) {
    await supabaseAdmin.from('flows').delete().eq('id', newFlow.id)
    return { ok: false, error: triggerError?.message ?? 'Falha ao copiar gatilho' }
  }

  revalidatePath('/automacoes')
  return { ok: true, triggerId: newTrigger.id }
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
