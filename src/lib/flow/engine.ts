import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendButtons, sendPrivateReply, sendText } from '@/lib/instagram/api'
import { flowDefinitionSchema, type FlowContext, type FlowNode } from '@/lib/flow/types'
import { assertUnderSendCap, logSend, SendCapError } from '@/lib/flow/send-cap'
import { spin } from '@/lib/flow/spintax'
import type { Account, Contact, Flow, FlowRun } from '@/types/db'

/** Trava contra fluxo que cicla sozinho: nós executados por invocação. */
const MAX_STEPS = 30

/** Cap de envios estourado: dorme e o cron re-executa o mesmo nó. */
const SEND_CAP_RETRY_MS = 5 * 60 * 1000

/** Fora dessa janela a Meta bloqueia DM comum. */
const DM_WINDOW_MS = 24 * 60 * 60 * 1000

class WindowClosedError extends Error {
  constructor() {
    super('Janela de 24h fechada: o contato precisa mandar mensagem antes.')
  }
}

function canSendDm(contact: Contact): boolean {
  if (!contact.last_inbound_at) return false
  return Date.now() - new Date(contact.last_inbound_at).getTime() < DM_WINDOW_MS
}

function interpolate(text: string, contact: Contact, ctx: FlowContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    if (key === 'nome' || key === 'name') return contact.name ?? contact.username ?? ''
    if (key === 'username') return contact.username ?? ''
    return ctx.vars[key] ?? ''
  })
}

function resolveSource(source: string, contact: Contact, ctx: FlowContext): string {
  if (source === 'last_input') return ctx.lastInput ?? ''
  if (source === 'tags') return contact.tags.join(',')
  if (source.startsWith('vars.')) return ctx.vars[source.slice('vars.'.length)] ?? ''
  return ctx.vars[source] ?? ''
}

/**
 * Primeira mensagem de um fluxo nascido de comentário sai como private reply
 * (não precisa da janela de 24h). Da segunda em diante é DM comum.
 */
async function deliver(
  account: Account,
  contact: Contact,
  ctx: FlowContext,
  payload: { text: string; quickReplies?: { title: string; payload: string }[]; buttons?: { title: string; url?: string; payload?: string }[] },
) {
  // Antes de qualquer envio — e antes de consumir pendingCommentId, para a
  // private reply não se perder quando o fluxo dormir por cap.
  await assertUnderSendCap(account.id)

  const text = spin(interpolate(payload.text, contact, ctx))

  if (ctx.pendingCommentId) {
    const commentId = ctx.pendingCommentId
    delete ctx.pendingCommentId
    await sendPrivateReply({
      igUserId: account.ig_user_id,
      accessToken: account.access_token,
      commentId,
      text,
    })
    await logSend(account.id, 'private_reply')
  } else {
    if (!canSendDm(contact)) throw new WindowClosedError()

    if (payload.buttons?.length) {
      await sendButtons({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        recipientId: contact.ig_user_id,
        text,
        buttons: payload.buttons,
      })
    } else {
      await sendText({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        recipientId: contact.ig_user_id,
        text,
        quickReplies: payload.quickReplies,
      })
    }
    await logSend(account.id, 'dm')
  }

  await supabaseAdmin.from('messages').insert({
    account_id: account.id,
    contact_id: contact.id,
    direction: 'out',
    text,
    payload: payload as unknown as Record<string, unknown>,
  })
}

interface StepResult {
  next: string | null
  halt?: { status: 'waiting_reply' } | { status: 'sleeping'; resumeAt: Date }
}

async function executeNode(
  node: FlowNode,
  account: Account,
  contact: Contact,
  ctx: FlowContext,
): Promise<StepResult> {
  switch (node.type) {
    case 'message':
      await deliver(account, contact, ctx, { text: node.text, quickReplies: node.quickReplies })
      return { next: node.next ?? null }

    case 'buttons':
      await deliver(account, contact, ctx, { text: node.text, buttons: node.buttons })
      return { next: node.next ?? null }

    case 'wait_reply':
      return { next: node.next ?? null, halt: { status: 'waiting_reply' } }

    case 'delay':
      return {
        next: node.next ?? null,
        halt: { status: 'sleeping', resumeAt: new Date(Date.now() + node.seconds * 1000) },
      }

    case 'condition': {
      for (const branch of node.cases) {
        const actual = resolveSource(branch.source, contact, ctx).toLowerCase()
        const expected = (branch.value ?? '').toLowerCase()

        const hit =
          branch.op === 'exists'
            ? actual.length > 0
            : branch.op === 'equals'
              ? actual === expected
              : branch.op === 'starts_with'
                ? actual.startsWith(expected)
                : branch.op === 'has_tag'
                  ? contact.tags.some((t) => t.toLowerCase() === expected)
                  : actual.includes(expected)

        if (hit) return { next: branch.next }
      }
      return { next: node.fallback ?? null }
    }

    case 'tag': {
      const removed = new Set((node.remove ?? []).map((t) => t.toLowerCase()))
      const tags = [
        ...new Set([
          ...contact.tags.filter((t) => !removed.has(t.toLowerCase())),
          ...(node.add ?? []),
        ]),
      ]

      await supabaseAdmin.from('contacts').update({ tags }).eq('id', contact.id)
      contact.tags = tags
      return { next: node.next ?? null }
    }

    case 'http': {
      const res = await fetch(node.url, {
        method: node.method,
        headers: node.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body:
          node.method === 'POST'
            ? JSON.stringify({
                contact: {
                  ig_user_id: contact.ig_user_id,
                  username: contact.username,
                  name: contact.name,
                  tags: contact.tags,
                },
                vars: ctx.vars,
                ...(node.body ?? {}),
              })
            : undefined,
      })

      if (node.saveAs) ctx.vars[node.saveAs] = (await res.text()).slice(0, 2000)
      return { next: node.next ?? null }
    }

    case 'end':
      return { next: null }
  }
}

/** Caminha do nó atual até pausar ou terminar, persistindo o estado no fim. */
async function walk(
  runRow: FlowRun,
  flow: Flow,
  account: Account,
  contact: Contact,
  ctx: FlowContext,
  startNode: string | null,
) {
  const definition = flowDefinitionSchema.parse(flow.definition)
  let cursor = startNode
  let steps = 0

  try {
    while (cursor && steps < MAX_STEPS) {
      const node = definition.nodes[cursor]
      if (!node) throw new Error(`Nó "${cursor}" não existe no fluxo "${flow.name}".`)

      steps += 1

      let result: StepResult
      try {
        result = await executeNode(node, account, contact, ctx)
      } catch (error) {
        if (error instanceof SendCapError) {
          await supabaseAdmin
            .from('flow_runs')
            .update({
              current_node: cursor,
              status: 'sleeping',
              resume_at: new Date(Date.now() + SEND_CAP_RETRY_MS).toISOString(),
              context: ctx,
            })
            .eq('id', runRow.id)
          return
        }
        throw error
      }

      if (result.halt) {
        await supabaseAdmin
          .from('flow_runs')
          .update({
            current_node: result.next,
            status: result.halt.status,
            resume_at: 'resumeAt' in result.halt ? result.halt.resumeAt.toISOString() : null,
            context: ctx,
          })
          .eq('id', runRow.id)
        return
      }

      cursor = result.next
    }

    await supabaseAdmin
      .from('flow_runs')
      .update({ current_node: null, status: 'done', resume_at: null, context: ctx })
      .eq('id', runRow.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabaseAdmin
      .from('flow_runs')
      .update({ status: 'failed', error: message, context: ctx })
      .eq('id', runRow.id)
    throw error
  }
}

/**
 * Inicia um fluxo para um contato. Se ele já estiver rodando outro, o novo trigger
 * é ignorado — evita dois fluxos disparando DM ao mesmo tempo.
 */
export async function startFlow(args: {
  account: Account
  flow: Flow
  contact: Contact
  commentId?: string
  input?: string
}) {
  const { data: existing } = await supabaseAdmin
    .from('flow_runs')
    .select('id')
    .eq('contact_id', args.contact.id)
    .in('status', ['running', 'waiting_reply', 'sleeping'])
    .maybeSingle()

  if (existing) return

  const definition = flowDefinitionSchema.parse(args.flow.definition)
  const ctx: FlowContext = {
    vars: {},
    lastInput: args.input,
    ...(args.commentId ? { pendingCommentId: args.commentId } : {}),
  }

  const { data: runRow, error } = await supabaseAdmin
    .from('flow_runs')
    .insert({
      account_id: args.account.id,
      flow_id: args.flow.id,
      contact_id: args.contact.id,
      current_node: definition.entry,
      status: 'running',
      context: ctx,
    })
    .select()
    .single()

  if (error || !runRow) throw new Error(`Não consegui criar flow_run: ${error?.message}`)

  await walk(runRow as FlowRun, args.flow, args.account, args.contact, ctx, definition.entry)
}

/** Retoma um fluxo pausado: resposta do contato (waiting_reply) ou cron (sleeping). */
export async function resumeFlow(args: {
  run: FlowRun
  account: Account
  contact: Contact
  input?: string
}) {
  const { data: flow } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('id', args.run.flow_id)
    .single()

  if (!flow) throw new Error(`Fluxo ${args.run.flow_id} não encontrado.`)

  const stored = args.run.context as Partial<FlowContext>
  const ctx: FlowContext = { ...stored, vars: stored.vars ?? {} }

  if (args.input !== undefined) {
    ctx.lastInput = args.input

    // O nó wait_reply que pausou aqui pode ter pedido para guardar a resposta.
    const definition = flowDefinitionSchema.parse((flow as Flow).definition)
    const waitingNode = Object.values(definition.nodes).find(
      (n) => n.type === 'wait_reply' && n.next === args.run.current_node,
    )
    if (waitingNode?.type === 'wait_reply' && waitingNode.saveAs) {
      ctx.vars[waitingNode.saveAs] = args.input
    }
  }

  await supabaseAdmin.from('flow_runs').update({ status: 'running' }).eq('id', args.run.id)
  await walk(args.run, flow as Flow, args.account, args.contact, ctx, args.run.current_node)
}
