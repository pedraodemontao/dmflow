'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { isDismissedError, markDismissed } from '@/lib/flow/dismissed'
import { flowDefinitionSchema } from '@/lib/flow/types'
import { checkFlowTexts, checkPublicReply, type VariationIssue } from '@/lib/flow/variation'
import { assertUnderSendCap, logSend } from '@/lib/flow/send-cap'
import { clearIceBreakers, sendText, setIceBreakers } from '@/lib/instagram/api'
import { DEFAULT_POSTS_PER_PROFILE } from '@/lib/library/cost'
import { importDefaultTrackedProfiles } from '@/lib/library/profiles'
import {
  runLibraryScrape,
  SCRAPE_BATCH_PROFILES,
  SCRAPE_BUDGET_MS,
  type ScrapeReport,
} from '@/lib/library/scrape'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAccount, getThread, type Thread } from '@/lib/data'
import type { Contact, IceBreaker } from '@/types/db'

const automationSchema = z.object({
  triggerId: z.string().uuid().nullish(),
  name: z.string().min(1, 'Dê um nome para a automação'),
  triggerType: z.enum(['comment', 'keyword', 'story_reply', 'story_mention', 'default']),
  keywords: z.array(z.string().min(1)),
  matchMode: z.enum(['exact', 'contains', 'starts_with']),
  mediaId: z.string().nullish(),
  publicReply: z.string().nullish(),
  isActive: z.boolean(),
  definition: flowDefinitionSchema,
})

export type AutomationInput = z.infer<typeof automationSchema>

const NODE_LABEL: Record<string, string> = {
  message: 'Mensagem',
  buttons: 'Botões',
  ask: 'Pergunta',
}

/**
 * Todo texto que o contato lê. Bloco de lógica não precisa variar.
 *
 * A versão anterior olhava só o campo `text`, e por isso três superfícies
 * escapavam da trava anti-spam: as bolhas do bloco `bubbles`, a legenda de
 * mídia e a repergunta do `ask`. Um bloco de 5 bolhas idênticas ativava sem
 * reclamação — e `bubbles` é justamente o bloco mais "humano", o que mais vai
 * ser usado em volume. O engine roda `spin()` em todos eles, então a variação
 * sempre foi suportada; o que faltava era cobrar.
 */
function readableTexts(definition: AutomationInput['definition']) {
  return Object.entries(definition.nodes).flatMap(([id, node]) => {
    const label = NODE_LABEL[node.type] ?? node.type
    const textos: Array<{ id: string; label: string; text: string }> = []

    if ('text' in node && typeof node.text === 'string') {
      // O rótulo carrega o id do bloco: é ele que aparece no card do canvas,
      // então o dono consegue ir direto no lugar em vez de abrir um por um.
      textos.push({ id, label: `${label} "${id}" (aba 3, Fluxo da DM)`, text: node.text })
    }

    if (node.type === 'bubbles') {
      node.bubbles.forEach((bubble, index) => {
        textos.push({ id: `${id}.${index}`, label: `${label} · bolha ${index + 1}`, text: bubble.text })
      })
    }

    if (node.type === 'ask' && node.retryText) {
      textos.push({ id: `${id}.retry`, label: `${label} · repergunta`, text: node.retryText })
    }

    if ('caption' in node && typeof node.caption === 'string' && node.caption) {
      textos.push({ id: `${id}.caption`, label: `${label} · legenda`, text: node.caption })
    }

    return textos
  })
}

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

  // Variação é obrigatória para ATIVAR. Rascunho pausado pode ficar como está —
  // o problema só existe quando começa a sair em volume.
  if (input.isActive) {
    const issues = [
      checkPublicReply(input.publicReply),
      ...checkFlowTexts(readableTexts(input.definition)),
    ].filter((issue): issue is VariationIssue => issue !== null)

    if (issues.length > 0) {
      // Lista TODAS, e cada uma diz onde clicar.
      //
      // A versão anterior mostrava só a primeira e resumia o resto em "(e mais
      // 3)". O dono ficava caçando: sabia que faltava variação em algum
      // "Botões", não sabia em qual bloco nem em qual aba. Erro que não diz
      // onde consertar transfere para o usuário um trabalho que a ferramenta
      // já tem a informação para fazer.
      const linhas = issues.map((issue) => `• ${issue.where}: ${issue.message}`)
      return { ok: false, error: linhas.join('\n') }
    }
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

  // Com mais de uma conta conectada, `getAccount()` devolve sempre a mais antiga
  // enquanto o inbox lista contato de todas: responder aqui sairia com o token da
  // conta errada. A Meta recusa o IGSID que não é dela, mas com erro genérico —
  // e uma tentativa recusada ainda conta no `send_log` da conta inocente.
  if (contact.account_id !== account.id) {
    return {
      ok: false,
      error: 'Esta conversa pertence a outra conta conectada. Não dá para responder pela conta atual.',
    }
  }

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

export async function setInboxStatus(
  contactId: string,
  status: 'open' | 'done' | 'snoozed',
  snoozeHours?: number,
): Promise<ActionResult> {
  const patch: Record<string, unknown> = { inbox_status: status }

  if (status === 'snoozed') {
    const hours = snoozeHours ?? 1
    patch.snooze_until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  } else {
    patch.snooze_until = null
  }

  // Sair da fila implica ter lido.
  if (status !== 'open') patch.unread_count = 0

  const { error } = await supabaseAdmin.from('contacts').update(patch).eq('id', contactId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/conversas')
  return { ok: true }
}

export async function saveContactNotes(contactId: string, notes: string): Promise<ActionResult> {
  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ notes: notes.trim() || null })
    .eq('id', contactId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/conversas')
  revalidatePath(`/contatos/${contactId}`)
  return { ok: true }
}

export async function createCannedReply(title: string, text: string): Promise<ActionResult> {
  const cleanTitle = title.trim()
  const cleanText = text.trim()
  if (!cleanTitle || !cleanText) {
    return { ok: false, error: 'Atalho precisa de título e texto.' }
  }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta conectada.' }

  const { error } = await supabaseAdmin
    .from('canned_replies')
    .insert({ account_id: account.id, title: cleanTitle, text: cleanText })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/conversas')
  return { ok: true }
}

export async function deleteCannedReply(id: string): Promise<ActionResult> {
  const { error } = await supabaseAdmin.from('canned_replies').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/conversas')
  return { ok: true }
}

export async function markThreadRead(contactId: string): Promise<ActionResult> {
  await supabaseAdmin.from('contacts').update({ unread_count: 0 }).eq('id', contactId)
  revalidatePath('/conversas')
  return { ok: true }
}

/** Botão de pânico: trava tudo sem desativar automação nenhuma. */
export async function setAutomationsPaused(paused: boolean): Promise<ActionResult> {
  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta conectada.' }

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({ automations_paused: paused })
    .eq('id', account.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  return { ok: true }
}

export async function setQuietHours(from: number | null, to: number | null): Promise<ActionResult> {
  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta conectada.' }

  const valid = (hour: number | null) => hour === null || (Number.isInteger(hour) && hour >= 0 && hour <= 23)
  if (!valid(from) || !valid(to)) return { ok: false, error: 'Horário inválido.' }
  if ((from === null) !== (to === null)) {
    return { ok: false, error: 'Defina as duas pontas do horário, ou desligue as duas.' }
  }
  if (from !== null && from === to) {
    return { ok: false, error: 'Início e fim não podem ser a mesma hora.' }
  }

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({ quiet_from: from, quiet_to: to })
    .eq('id', account.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  return { ok: true }
}

const iceBreakerSchema = z.object({
  question: z.string().trim().min(1, 'Escreva a pergunta').max(80, 'Máximo 80 caracteres'),
  payload: z.string().trim().min(1, 'Defina um payload').max(200, 'Payload muito longo'),
})

const iceBreakersSchema = z.array(iceBreakerSchema).max(4, 'Máximo de 4 ice breakers')

/**
 * Salva as perguntas fixas no banco e publica na Meta (POST /messenger_profile).
 * Lista vazia limpa o que está publicado (DELETE) em vez de dar erro — é
 * assim que o dono desliga os ice breakers pela mesma tela.
 *
 * Se o banco salvar mas a Meta recusar a publicação, o erro volta claro: o
 * texto não fica perdido (já está salvo), só desatualizado em relação ao
 * que está ao vivo na conta.
 */
export async function saveIceBreakers(raw: unknown): Promise<ActionResult> {
  const parsed = iceBreakersSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const payloads = parsed.data.map((ib) => ib.payload)
  if (new Set(payloads).size !== payloads.length) {
    return { ok: false, error: 'Os payloads precisam ser únicos entre si.' }
  }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  const iceBreakers: IceBreaker[] = parsed.data

  const { error: dbError } = await supabaseAdmin
    .from('accounts')
    .update({ ice_breakers: iceBreakers })
    .eq('id', account.id)

  if (dbError) return { ok: false, error: dbError.message }

  try {
    if (iceBreakers.length === 0) {
      await clearIceBreakers({ accessToken: account.access_token })
    } else {
      await setIceBreakers({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        iceBreakers,
      })
    }

    await supabaseAdmin
      .from('accounts')
      .update({ ice_breakers_synced_at: new Date().toISOString() })
      .eq('id', account.id)
  } catch (error) {
    revalidatePath('/ice-breakers')
    return {
      ok: false,
      error: `Salvei no banco, mas publicar na Meta falhou: ${
        error instanceof Error ? error.message : 'erro desconhecido'
      }`,
    }
  }

  revalidatePath('/ice-breakers')
  return { ok: true }
}

export async function updateContactTags(
  contactId: string,
  tags: string[],
): Promise<ActionResult> {
  const clean = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ tags: clean })
    .eq('id', contactId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/contatos')
  revalidatePath(`/contatos/${contactId}`)
  return { ok: true }
}

export async function saveContactField(
  contactId: string,
  key: string,
  value: string,
): Promise<ActionResult> {
  const cleanKey = key.trim()
  if (!cleanKey) return { ok: false, error: 'Dê um nome ao campo.' }

  const { data } = await supabaseAdmin
    .from('contacts')
    .select('fields')
    .eq('id', contactId)
    .maybeSingle()

  if (!data) return { ok: false, error: 'Contato não encontrado.' }

  const fields = { ...((data.fields ?? {}) as Record<string, unknown>), [cleanKey]: value }
  const { error } = await supabaseAdmin.from('contacts').update({ fields }).eq('id', contactId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/contatos/${contactId}`)
  return { ok: true }
}

export async function removeContactField(contactId: string, key: string): Promise<ActionResult> {
  const { data } = await supabaseAdmin
    .from('contacts')
    .select('fields')
    .eq('id', contactId)
    .maybeSingle()

  if (!data) return { ok: false, error: 'Contato não encontrado.' }

  const fields = { ...((data.fields ?? {}) as Record<string, unknown>) }
  delete fields[key]

  const { error } = await supabaseAdmin.from('contacts').update({ fields }).eq('id', contactId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/contatos/${contactId}`)
  return { ok: true }
}

/**
 * Apaga o contato. A cascata leva mensagens, execuções de fluxo e eventos de
 * métrica junto — é o histórico inteiro daquela pessoa.
 */
export async function deleteContact(contactId: string): Promise<ActionResult> {
  const { error } = await supabaseAdmin.from('contacts').delete().eq('id', contactId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/contatos')
  revalidatePath('/conversas')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Zera contatos e fila para começar um teste limpo. Não toca em automações,
 * fluxos, atalhos nem na conta conectada.
 *
 * `send_log` fica de fora de propósito: é o livro-caixa do cap de envios por
 * hora, e limpá-lo seria uma forma de furar a própria blindagem anti-flag.
 */
export async function resetTestData(): Promise<ActionResult> {
  const impossible = '00000000-0000-0000-0000-000000000000'

  const [contacts, events] = await Promise.all([
    supabaseAdmin.from('contacts').delete().neq('id', impossible).select('id'),
    // Só o que ainda não foi processado. Apagar 'done' e 'failed' destruiria o
    // livro de dedup e faria o polling reprocessar tudo — resposta pública e
    // private reply repetidas para quem já tinha recebido.
    supabaseAdmin.from('webhook_events').delete().eq('status', 'pending').select('id'),
  ])

  if (contacts.error) return { ok: false, error: contacts.error.message }
  if (events.error) return { ok: false, error: events.error.message }

  revalidatePath('/contatos')
  revalidatePath('/conversas')
  revalidatePath('/')
  return { ok: true }
}

export async function setContactSubscribed(
  contactId: string,
  subscribed: boolean,
): Promise<ActionResult> {
  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ subscribed })
    .eq('id', contactId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/contatos')
  revalidatePath(`/contatos/${contactId}`)
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

// ---------------------------------------------------------------------------
// Disparos falhados: as duas saídas do card de falhas do cockpit.
//
// Antes disto, `flow_runs.status = 'failed'` era um beco sem saída: o run nunca
// mais anda sozinho e a única cura era editar o banco na mão. Uma falha antiga
// (token morto por algumas horas, por exemplo) deixava o painel vermelho para
// sempre — o menino que gritou lobo.
// ---------------------------------------------------------------------------

const runIdSchema = z.string().uuid('Disparo inválido.')

/** Teto de uma ação em lote: o caso real é um punhado de falhas do mesmo período. */
const BULK_LIMIT = 50

interface FailedRunRow {
  id: string
  contact_id: string
  current_node: string | null
  error: string | null
}

/**
 * Falhas da CONTA ATIVA — o id que vem do cliente nunca basta sozinho. Sem o
 * `account_id` no filtro, um id chutado no formulário mexeria em run de outra
 * conta (single-tenant hoje, mas o dado já é escopado assim no banco).
 */
async function loadFailedRuns(accountId: string, runId?: string): Promise<FailedRunRow[]> {
  let query = supabaseAdmin
    .from('flow_runs')
    .select('id, contact_id, current_node, error')
    .eq('account_id', accountId)
    .eq('status', 'failed')

  if (runId) query = query.eq('id', runId)

  const { data } = await query.order('updated_at', { ascending: false }).limit(BULK_LIMIT)

  // Dispensada não é candidata a nada: já saiu do card de propósito.
  return ((data ?? []) as FailedRunRow[]).filter((row) => !isDismissedError(row.error))
}

/**
 * Devolve um run falhado para a fila do cron.
 *
 * O estado é `sleeping` com `resume_at` vencido, NÃO `running`: quem retoma é
 * `resumeSleepingRuns` (src/app/api/cron/tick/route.ts) e ele só procura
 * `status = 'sleeping'` com `resume_at <= now()`. Um run em `running` não é
 * varrido por ninguém — ficaria travado igual, e ainda ocuparia a vaga do
 * índice único `flow_runs_active_idx` (um fluxo ativo por contato).
 *
 * `current_node` fica como está: é dali que o `resumeFlow` recomeça. Daí em
 * diante a mensagem sai DE VERDADE — o cron ainda respeita pausa geral,
 * horário de silêncio e cap de envios antes de retomar, então o disparo pode
 * demorar mais que um tick, mas ele acontece.
 *
 * Devolve a mensagem de erro, ou null quando deu certo.
 */
async function requeueFailedRun(run: FailedRunRow, accountId: string): Promise<string | null> {
  if (!run.current_node) {
    return 'Esse disparo parou sem bloco atual — não existe de onde retomar. Dispense e dispare a automação de novo.'
  }

  // Índice único `flow_runs_active_idx`: um contato só tem um fluxo ativo por
  // vez. Sem esta checagem o update estouraria com violação de unicidade crua.
  const { data: active } = await supabaseAdmin
    .from('flow_runs')
    .select('id')
    .eq('contact_id', run.contact_id)
    .in('status', ['running', 'waiting_reply', 'sleeping'])
    .maybeSingle()

  if (active) {
    return 'Esse contato já está com outro fluxo em andamento — espere ele terminar para reenviar este.'
  }

  const { error } = await supabaseAdmin
    .from('flow_runs')
    .update({ status: 'sleeping', resume_at: new Date().toISOString(), error: null })
    .eq('id', run.id)
    .eq('account_id', accountId)
    .eq('status', 'failed')

  return error ? error.message : null
}

/**
 * Tenta o disparo de novo. ATENÇÃO: manda mensagem de verdade no próximo tick
 * do cron — não é limpar a tela.
 */
export async function retryFailedRun(runId: string): Promise<ActionResult> {
  const parsed = runIdSchema.safeParse(runId)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  const [run] = await loadFailedRuns(account.id, parsed.data)
  if (!run) return { ok: false, error: 'Disparo não encontrado ou já fora da lista de falhas.' }

  const failure = await requeueFailedRun(run, account.id)
  if (failure) return { ok: false, error: failure }

  revalidatePath('/')
  return { ok: true }
}

/**
 * Reconhece a falha sem reprocessar: sai do card e não volta. Nada é enviado.
 * O porquê de marcar no texto do erro em vez de mexer no `status` está em
 * `src/lib/flow/dismissed.ts`.
 */
export async function dismissFailedRun(runId: string): Promise<ActionResult> {
  const parsed = runIdSchema.safeParse(runId)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  const [run] = await loadFailedRuns(account.id, parsed.data)
  if (!run) return { ok: false, error: 'Disparo não encontrado ou já fora da lista de falhas.' }

  const { error } = await supabaseAdmin
    .from('flow_runs')
    .update({ error: markDismissed(run.error) })
    .eq('id', run.id)
    .eq('account_id', account.id)
    .eq('status', 'failed')

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  return { ok: true }
}

export interface BulkActionResult extends ActionResult {
  /** Quantos disparos a ação de fato mexeu. */
  affected: number
  /** Pulados: sem bloco atual, ou contato já rodando outro fluxo. */
  skipped: number
}

/**
 * O caso real é sempre um lote do mesmo período (token caído por algumas
 * horas), então tratar um por um seria trabalho manual à toa. MANDA MENSAGEM
 * DE VERDADE para todo mundo da lista — o cap de envios/hora continua valendo
 * e segura o ritmo, mas o volume sai.
 */
export async function retryAllFailedRuns(): Promise<BulkActionResult> {
  const account = await getAccount()
  if (!account) {
    return { ok: false, error: 'Nenhuma conta do Instagram conectada.', affected: 0, skipped: 0 }
  }

  const runs = await loadFailedRuns(account.id)

  let affected = 0
  let skipped = 0
  let lastFailure: string | undefined

  for (const run of runs) {
    const failure = await requeueFailedRun(run, account.id)
    if (failure) {
      skipped += 1
      lastFailure = failure
    } else {
      affected += 1
    }
  }

  revalidatePath('/')
  return {
    // Só é fracasso quando NADA voltou para a fila tendo algo para voltar.
    ok: affected > 0 || skipped === 0,
    ...(skipped > 0 ? { error: `${skipped} não voltaram para a fila. ${lastFailure}` } : {}),
    affected,
    skipped,
  }
}

export async function dismissAllFailedRuns(): Promise<BulkActionResult> {
  const account = await getAccount()
  if (!account) {
    return { ok: false, error: 'Nenhuma conta do Instagram conectada.', affected: 0, skipped: 0 }
  }

  const runs = await loadFailedRuns(account.id)

  let affected = 0
  let lastFailure: string | undefined

  for (const run of runs) {
    const { error } = await supabaseAdmin
      .from('flow_runs')
      .update({ error: markDismissed(run.error) })
      .eq('id', run.id)
      .eq('account_id', account.id)
      .eq('status', 'failed')

    if (error) lastFailure = error.message
    else affected += 1
  }

  const skipped = runs.length - affected

  revalidatePath('/')
  return {
    ok: skipped === 0,
    ...(skipped > 0 ? { error: `${skipped} não saíram do card. ${lastFailure}` } : {}),
    affected,
    skipped,
  }
}

/**
 * Devolve um evento descartado para a fila.
 *
 * Diferente do retry de `flow_run`, aqui não há risco de mandar a mesma
 * resposta pública duas vezes: `webhook_events.public_reply_sent` marca o que
 * já saiu, e o reprocessamento respeita a marca. O que pode sair de novo é a
 * DM — e sai, porque o comentário nunca foi respondido.
 */
export async function retryDroppedEvent(eventId: string): Promise<ActionResult> {
  const parsed = z.string().uuid('Evento inválido.').safeParse(eventId)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({ status: 'pending', attempts: 0, error: null, process_after: new Date().toISOString() })
    .eq('id', parsed.data)
    .eq('status', 'failed')

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  return { ok: true }
}

/** Reconhece o evento descartado sem reprocessar. Nada é enviado. */
export async function dismissDroppedEvent(eventId: string): Promise<ActionResult> {
  const parsed = z.string().uuid('Evento inválido.').safeParse(eventId)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const { error } = await supabaseAdmin
    .from('webhook_events')
    // 'done' aqui não mente: o evento saiu da fila por decisão do dono, e
    // `webhook_events` não alimenta métrica de conversão nenhuma — diferente
    // de `flow_runs`, onde 'done' inflaria "concluídos".
    .update({ status: 'done', processed_at: new Date().toISOString() })
    .eq('id', parsed.data)
    .eq('status', 'failed')

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
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

// ============================================================
// Biblioteca de referência
// ============================================================

export interface ImportProfilesActionResult extends ActionResult {
  total: number
  inserted: number
}

/**
 * Põe a lista curada do dono em `tracked_profiles`.
 *
 * A lista e o porquê de ela ser uma action em vez de um seed SQL estão em
 * `src/lib/library/profiles.ts`. Resumo: o seed precisaria de um `account_id`
 * colado à mão, e ele só existe depois que o Instagram é conectado.
 */
export async function importDefaultProfiles(): Promise<ImportProfilesActionResult> {
  const account = await getAccount()
  if (!account) {
    return { ok: false, error: 'Nenhuma conta do Instagram conectada.', total: 0, inserted: 0 }
  }

  const result = await importDefaultTrackedProfiles(account.id)

  if (result.error) {
    return { ok: false, error: result.error, total: result.total, inserted: result.inserted }
  }

  revalidatePath('/biblioteca')
  return { ok: true, total: result.total, inserted: result.inserted }
}

/**
 * A entrada é validada mesmo vindo de uma tela nossa: Server Action é endpoint
 * HTTP, e aqui um número errado vira dinheiro gasto na Apify.
 */
const scrapeSchema = z.object({
  postsPerProfile: z.coerce.number().int().min(1).max(50).default(DEFAULT_POSTS_PER_PROFILE),
  batchSize: z.coerce.number().int().min(1).max(20).default(SCRAPE_BATCH_PROFILES),
  /**
   * Quanto tempo esta chamada pode gastar. Fica na entrada porque o teto real
   * depende da PÁGINA que chamou (Server Action herda o `maxDuration` dela):
   * uma página que declare 300 s pode pedir mais e fazer a rodada inteira num
   * clique só.
   */
  budgetMs: z.coerce.number().int().min(5_000).max(280_000).default(SCRAPE_BUDGET_MS),
})

export interface ScrapeActionResult extends ActionResult, ScrapeReport {}

/**
 * Dispara (e continua) a raspagem da biblioteca.
 *
 * Chamar de novo CONTINUA de onde parou — não recomeça e não paga duas vezes.
 * O porquê disso, e como o teto de duração da serverless foi resolvido sem
 * infraestrutura nova, está em `src/lib/library/scrape.ts`.
 */
export async function scrapeLibrary(raw?: unknown): Promise<ScrapeActionResult> {
  const parsed = scrapeSchema.safeParse(raw ?? {})

  const account = await getAccount()
  const vazio: ScrapeReport = {
    phase: 'sem-perfil',
    message: '',
    runsStarted: 0,
    received: 0,
    inserted: 0,
    updated: 0,
    profilesTouched: 0,
    profilesRemaining: 0,
    costUsd: 0,
    errors: [],
  }

  if (!parsed.success) {
    return { ...vazio, ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  if (!account) {
    return { ...vazio, ok: false, error: 'Nenhuma conta do Instagram conectada.' }
  }

  try {
    const report = await runLibraryScrape({ accountId: account.id, ...parsed.data })

    revalidatePath('/biblioteca')

    return {
      ...report,
      // Rodada que gravou alguma coisa é sucesso mesmo com erro em um lote:
      // raspagem parcial é melhor que raspagem perdida, e o dono precisa ver o
      // que entrou em vez de uma tela vermelha que apaga o progresso.
      ok: report.errors.length === 0 || report.inserted + report.updated > 0,
      ...(report.errors.length > 0 ? { error: report.errors.join('\n') } : {}),
    }
  } catch (error) {
    return {
      ...vazio,
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível raspar agora.',
    }
  }
}
