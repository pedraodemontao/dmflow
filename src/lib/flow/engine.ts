import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  sendButtons,
  sendCarousel,
  sendMedia,
  sendPrivateReply,
  sendText,
  type MediaKind,
} from '@/lib/instagram/api'
import { flowDefinitionSchema, type FlowContext, type FlowNode } from '@/lib/flow/types'
import { assertUnderSendCap, logSend, SendCapError } from '@/lib/flow/send-cap'
import { spin } from '@/lib/flow/spintax'
import { RETRY_FALLBACK, validateAnswer } from '@/lib/flow/validate-answer'
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

/** Pausa curta entre bolhas de um bloco `bubbles` — não é o bloco de delay. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function interpolate(text: string, contact: Contact, ctx: FlowContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    if (key === 'nome' || key === 'name') return contact.name ?? contact.username ?? ''
    if (key === 'username') return contact.username ?? ''
    // Identificador para carregar no link da página: é ele que permite ao
    // endpoint de conversão saber QUEM converteu. Sem isso, a página só
    // conhece o telefone e a gente só conhece o perfil do Instagram.
    if (key === 'contact_id') return contact.id
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

  // Botões também interpolam: o link precisa carregar {{contact_id}}.
  const buttons = payload.buttons?.map((button) => ({
    ...button,
    title: spin(interpolate(button.title, contact, ctx)),
    ...(button.url ? { url: interpolate(button.url, contact, ctx) } : {}),
  }))

  // Resposta rápida ia CRUA para a Meta enquanto o botão ao lado interpolava.
  // Quem escrevesse `{Quero|Bora}` ou `{{nome}}` numa resposta rápida via o
  // texto sair literal para o contato, com as chaves. A tela agora ensina a
  // sintaxe logo acima, então a chance de alguém tentar só aumentou.
  const quickReplies = payload.quickReplies?.map((quickReply) => ({
    ...quickReply,
    title: spin(interpolate(quickReply.title, contact, ctx)),
  }))

  if (ctx.pendingCommentId) {
    const commentId = ctx.pendingCommentId
    delete ctx.pendingCommentId
    await sendPrivateReply({
      igUserId: account.ig_user_id,
      accessToken: account.access_token,
      commentId,
      text,
      // Botões e quick replies iam para o lixo aqui: o fluxo nascido de
      // comentário perdia justamente o que abre a janela de 24h.
      buttons,
      quickReplies,
    })
    await logSend(account.id, 'private_reply')
  } else {
    if (!canSendDm(contact)) throw new WindowClosedError()

    if (buttons?.length) {
      await sendButtons({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        recipientId: contact.ig_user_id,
        text,
        buttons,
      })
    } else {
      await sendText({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        recipientId: contact.ig_user_id,
        text,
        quickReplies,
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

const MEDIA_LABEL: Record<MediaKind, string> = {
  image: 'imagem',
  video: 'vídeo',
  audio: 'áudio',
  file: 'arquivo',
}

/**
 * Anexo por URL pública — imagem, vídeo, áudio e arquivo compartilham a mesma
 * mecânica (cap, janela de 24h, legenda como mensagem à parte porque a Meta
 * não aceita legenda no anexo), só troca o `type`. Uma função só evita
 * repetir o bloco de 4 vezes (uma por tipo de mídia) no `executeNode`.
 */
/**
 * Marca, dentro do próprio `vars`, que a legenda de um nó de mídia já saiu.
 *
 * Fica em `vars` e não num campo próprio do `FlowContext` porque o contexto é
 * persistido como JSON e `vars` já viaja inteiro — um campo novo exigiria
 * mexer no schema por causa de um detalhe de execução. O prefixo `__` é
 * reservado: nenhum bloco de fluxo escreve variável com esse nome.
 */
const captionKey = (nodeId: string) => `__legenda_${nodeId}`

async function deliverMedia(
  mediaType: MediaKind,
  nodeId: string,
  node: { url: string; caption?: string; next?: string | null },
  account: Account,
  contact: Contact,
  ctx: FlowContext,
): Promise<StepResult> {
  await assertUnderSendCap(account.id)
  if (!canSendDm(contact) && !ctx.pendingCommentId) throw new WindowClosedError()

  // Guardado antes de chamar `deliver()`: ela apaga `ctx.pendingCommentId` como
  // efeito colateral (consome o comentário na private reply), então checar a
  // flag de novo depois mandaria a legenda uma segunda vez — e a segunda,
  // sem `pendingCommentId`, cai no caminho de DM comum e explode fora da janela.
  const isCommentOrigin = Boolean(ctx.pendingCommentId)

  // ANEXO NÃO CABE EM PRIVATE REPLY, e a janela de 24h não abre só porque a
  // pessoa comentou (invariante do CLAUDE.md: comentário não seta
  // `last_inbound_at`). Antes daqui o código mandava a legenda pela private
  // reply e em seguida tentava o anexo como DM comum — que a Meta recusa com
  // "outside of allowed window". Resultado: TODO bloco de mídia alcançado a
  // partir de comentário matava o fluxo, e a pessoa recebia só a legenda.
  //
  // Agora o fluxo ESPERA: a legenda sai pela private reply (com o que o autor
  // escreveu, que é onde entra o convite para responder ou tocar no botão) e o
  // run para em `waiting_reply` NESTE nó. Quando a pessoa responde ou toca num
  // postback, a janela abre, `resumeFlow` volta exatamente aqui e o anexo sai.
  if (isCommentOrigin && !canSendDm(contact)) {
    if (node.caption) {
      await deliver(account, contact, ctx, { text: node.caption })
      // Marca para a retomada não repetir a legenda.
      ctx.vars[captionKey(nodeId)] = '1'
    }
    return { next: nodeId, halt: { status: 'waiting_reply' } }
  }

  // Private reply com janela já aberta: legenda por ela, anexo em seguida.
  if (isCommentOrigin && node.caption) {
    await deliver(account, contact, ctx, { text: node.caption })
    ctx.vars[captionKey(nodeId)] = '1'
    await assertUnderSendCap(account.id)
  }

  await sendMedia({
    igUserId: account.ig_user_id,
    accessToken: account.access_token,
    recipientId: contact.ig_user_id,
    type: mediaType,
    url: node.url,
  })
  await logSend(account.id, 'dm')

  await supabaseAdmin.from('messages').insert({
    account_id: account.id,
    contact_id: contact.id,
    direction: 'out',
    text: node.caption ?? `[${MEDIA_LABEL[mediaType]}]`,
    payload: { [mediaType]: node.url },
  })

  if (node.caption && !isCommentOrigin && !ctx.vars[captionKey(nodeId)]) {
    await deliver(account, contact, ctx, { text: node.caption })
  }
  // A marca só serve enquanto o nó está em execução; deixá-la suja poluiria a
  // ficha do contato se um dia `vars` for exposto na interface.
  delete ctx.vars[captionKey(nodeId)]

  return { next: node.next ?? null }
}

interface StepResult {
  next: string | null
  halt?: { status: 'waiting_reply' } | { status: 'sleeping'; resumeAt: Date }
  /** Nó `goto_flow`: sinaliza para o `walk()` trocar de definição no meio da execução. */
  gotoFlow?: { flowId: string }
}

async function executeNode(
  nodeId: string,
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

    case 'carousel': {
      await assertUnderSendCap(account.id)
      if (!canSendDm(contact) && !ctx.pendingCommentId) throw new WindowClosedError()

      const cards = node.cards.map((card) => ({
        title: spin(interpolate(card.title, contact, ctx)),
        ...(card.subtitle ? { subtitle: spin(interpolate(card.subtitle, contact, ctx)) } : {}),
        ...(card.imageUrl ? { imageUrl: interpolate(card.imageUrl, contact, ctx) } : {}),
        ...(card.buttons?.length
          ? {
              buttons: card.buttons.map((button) => ({
                ...button,
                title: spin(interpolate(button.title, contact, ctx)),
                ...(button.url ? { url: interpolate(button.url, contact, ctx) } : {}),
              })),
            }
          : {}),
      }))

      // Fallback de texto: usado se a private reply recusar o template, e
      // também guardado no histórico como resumo do carrossel enviado.
      const fallbackText = cards.map((c) => c.title).join(' · ')

      if (ctx.pendingCommentId) {
        const commentId = ctx.pendingCommentId
        delete ctx.pendingCommentId
        await sendPrivateReply({
          igUserId: account.ig_user_id,
          accessToken: account.access_token,
          commentId,
          text: fallbackText,
          cards,
        })
        await logSend(account.id, 'private_reply')
      } else {
        await sendCarousel({
          igUserId: account.ig_user_id,
          accessToken: account.access_token,
          recipientId: contact.ig_user_id,
          cards,
        })
        await logSend(account.id, 'dm')
      }

      await supabaseAdmin.from('messages').insert({
        account_id: account.id,
        contact_id: contact.id,
        direction: 'out',
        text: `[carrossel] ${fallbackText}`,
        payload: { carousel: cards },
      })

      return { next: node.next ?? null }
    }

    case 'bubbles': {
      // Cada bolha passa pela mesma `deliver()` do bloco `message` — cap,
      // janela de 24h e private reply valem por bolha, igual a um `message`
      // sozinho. A pausa é só entre elas, para não atrasar a primeira.
      for (let i = 0; i < node.bubbles.length; i += 1) {
        if (i > 0) await sleep(node.pauseMs)
        await deliver(account, contact, ctx, { text: node.bubbles[i].text })
      }
      return { next: node.next ?? null }
    }

    case 'goto_flow':
      // O `walk()` é quem troca a definição em uso; aqui só sinalizamos o alvo.
      return { next: null, gotoFlow: { flowId: node.flowId } }

    case 'image':
      return deliverMedia('image', nodeId, node, account, contact, ctx)

    case 'video':
      return deliverMedia('video', nodeId, node, account, contact, ctx)

    case 'audio':
      return deliverMedia('audio', nodeId, node, account, contact, ctx)

    case 'file':
      return deliverMedia('file', nodeId, node, account, contact, ctx)

    case 'ask':
      await deliver(account, contact, ctx, { text: node.text })
      ctx.awaitingAsk = { nodeId, retries: 0 }
      // Fica parado no próprio nó: quem valida a resposta é o resumeFlow.
      return { next: nodeId, halt: { status: 'waiting_reply' } }

    case 'set_field': {
      const fields = { ...(contact.fields ?? {}) }
      for (const field of node.fields) {
        fields[field.key] = interpolate(field.value, contact, ctx)
      }

      await supabaseAdmin.from('contacts').update({ fields }).eq('id', contact.id)
      contact.fields = fields
      return { next: node.next ?? null }
    }

    case 'randomize': {
      const pick = node.paths[Math.floor(Math.random() * node.paths.length)]
      return { next: pick?.next ?? null }
    }

    case 'unsubscribe':
      await supabaseAdmin.from('contacts').update({ subscribed: false }).eq('id', contact.id)
      contact.subscribed = false
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

      const corpo = (await res.text()).slice(0, 2000)

      // `fetch` só rejeita em falha de REDE — 4xx e 5xx voltam como resposta
      // normal. Sem esta checagem, um webhook externo devolvendo 500 fazia o
      // fluxo seguir como se tivesse dado certo, e `saveAs` guardava o corpo do
      // ERRO como se fosse a resposta. O contato então recebia a mensagem
      // seguinte com o texto do erro interpolado dentro.
      if (!res.ok) {
        throw new Error(`Webhook ${node.url} respondeu ${res.status}: ${corpo.slice(0, 200)}`)
      }

      if (node.saveAs) ctx.vars[node.saveAs] = corpo
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
  // `let`, não `const`: um nó `goto_flow` troca a definição em uso no meio do walk.
  let definition = flowDefinitionSchema.parse(flow.definition)
  let cursor = startNode
  let steps = 0

  try {
    while (cursor && steps < MAX_STEPS) {
      const node = definition.nodes[cursor]
      if (!node) throw new Error(`Nó "${cursor}" não existe no fluxo "${flow.name}".`)

      steps += 1

      // Registro do funil: quem passou por qual bloco. Falha aqui não pode
      // derrubar o fluxo — métrica é acessório, entrega não.
      void supabaseAdmin
        .from('flow_node_events')
        .insert({
          flow_id: flow.id,
          run_id: runRow.id,
          contact_id: contact.id,
          node_id: cursor,
          node_type: node.type,
        })
        .then(({ error }) => {
          if (error) console.error('[dm-flow] métrica de nó falhou:', error.message)
        })

      let result: StepResult
      try {
        result = await executeNode(cursor, node, account, contact, ctx)
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

      if (result.gotoFlow) {
        // account_id isola por conta mesmo hoje single-tenant — nunca pula
        // para um fluxo de outra conta.
        const { data: targetRow } = await supabaseAdmin
          .from('flows')
          .select('*')
          .eq('id', result.gotoFlow.flowId)
          .eq('account_id', account.id)
          .maybeSingle()

        if (!targetRow) {
          throw new Error(`Fluxo de destino "${result.gotoFlow.flowId}" não existe.`)
        }

        flow = targetRow as Flow
        definition = flowDefinitionSchema.parse(flow.definition)
        // Persiste a troca antes de continuar: se o walk pausar (ou falhar)
        // logo em seguida, o cron/resumeFlow tem que achar o fluxo certo.
        await supabaseAdmin.from('flow_runs').update({ flow_id: flow.id }).eq('id', runRow.id)
        cursor = definition.entry
        continue
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
  // Quem pediu para sair não recebe mais automação.
  if (!args.contact.subscribed) return

  const { data: existing } = await supabaseAdmin
    .from('flow_runs')
    .select('id')
    .eq('contact_id', args.contact.id)
    .in('status', ['running', 'waiting_reply', 'sleeping'])
    .maybeSingle()

  if (existing) return

  // Run que já morreu neste fluxo para este contato: RETOMA de onde parou, não
  // recomeça. Sem isto, a retentativa do evento criava um run novo e caminhava
  // desde `definition.entry` — reentregando toda mensagem já enviada antes da
  // falha. Doze retentativas viravam doze cópias da mesma sequência, que é
  // exatamente o padrão de repetição que restringiu a conta em jul/2026.
  //
  // Só retoma o que tem `current_node`: sem bloco atual não existe ponto de
  // retomada, e aí começar do zero é o comportamento certo.
  const { data: died } = await supabaseAdmin
    .from('flow_runs')
    .select('*')
    .eq('contact_id', args.contact.id)
    .eq('flow_id', args.flow.id)
    .eq('status', 'failed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // `current_node` nulo não tem ponto de retomada — aí recomeçar é o certo.
  // O filtro fica aqui e não na query de propósito: `.not()` amarraria o
  // código ao dialeto do PostgREST por uma condição de uma linha.
  if (died && (died as FlowRun).current_node) {
    const run = died as FlowRun
    const stored = (run.context ?? {}) as Partial<FlowContext>
    const ctx: FlowContext = { vars: {}, ...stored }

    // Claim: só retoma quem conseguiu virar o status. Dois ticks sobrepostos
    // reivindicando o mesmo run morto reenviariam a mesma sequência.
    const { data: claimed } = await supabaseAdmin
      .from('flow_runs')
      .update({ status: 'running', error: null })
      .eq('id', run.id)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle()

    if (!claimed) return

    await walk(run, args.flow, args.account, args.contact, ctx, run.current_node)
    return
  }

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
  const definition = flowDefinitionSchema.parse((flow as Flow).definition)
  let startNode = args.run.current_node

  if (args.input !== undefined) {
    ctx.lastInput = args.input

    const askState = ctx.awaitingAsk
    const askNode = askState ? definition.nodes[askState.nodeId] : undefined

    if (askState && askNode?.type === 'ask' && askState.nodeId === args.run.current_node) {
      const { ok, value } = validateAnswer(askNode.expect, args.input)

      if (!ok && askState.retries < askNode.maxRetries) {
        // Não passou e ainda há tentativa: repergunta e continua parado no nó.
        await deliver(args.account, args.contact, ctx, {
          text: askNode.retryText || RETRY_FALLBACK[askNode.expect],
        })

        await supabaseAdmin
          .from('flow_runs')
          .update({
            context: { ...ctx, awaitingAsk: { ...askState, retries: askState.retries + 1 } },
          })
          .eq('id', args.run.id)
        return
      }

      // Validou, ou esgotou as tentativas: guarda o que deu e segue.
      ctx.vars[askNode.saveAs] = value
      delete ctx.awaitingAsk
      startNode = askNode.next ?? null
    } else {
      // O nó wait_reply que pausou aqui pode ter pedido para guardar a resposta.
      const waitingNode = Object.values(definition.nodes).find(
        (n) => n.type === 'wait_reply' && n.next === args.run.current_node,
      )
      if (waitingNode?.type === 'wait_reply' && waitingNode.saveAs) {
        ctx.vars[waitingNode.saveAs] = args.input
      }
    }
  }

  await supabaseAdmin.from('flow_runs').update({ status: 'running' }).eq('id', args.run.id)
  await walk(args.run, flow as Flow, args.account, args.contact, ctx, startNode)
}
