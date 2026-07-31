import { supabaseAdmin } from '@/lib/supabase/admin'
import { fetchContactProfile, replyToComment } from '@/lib/instagram/api'
import { isPermanentError } from '@/lib/instagram/errors'
import {
  payloadForTitle,
  resolveButtonSource,
  type FlowDefinitionRow,
} from '@/lib/flow/button-source'
import { resumeFlow, startFlow } from '@/lib/flow/engine'
import { assertUnderSendCap, isUnderPublicReplyCap, logSend } from '@/lib/flow/send-cap'
import { isQuiet, nextOpening } from '@/lib/flow/quiet-hours'
import { spin } from '@/lib/flow/spintax'
import { findTrigger } from '@/lib/flow/triggers'
import type { Account, Contact, Flow, FlowRun, TriggerType } from '@/types/db'

/**
 * Resposta instantânea a comentário é assinatura de bot. O que importa para o
 * filtro é não ser imediato e não ser sempre igual — não que demore muito.
 * 8–35s dá variação suficiente e mantém a resposta na janela de atenção de
 * quem acabou de comentar.
 */
const COMMENT_JITTER_MIN_MS = 8_000
const COMMENT_JITTER_RANGE_MS = 27_000

/**
 * Espalhamento em milissegundos. Usado tanto na entrada da fila quanto na
 * reabertura do horário de silêncio — nos dois casos o inimigo é o mesmo:
 * um monte de envio no mesmo instante.
 */
function jitterMs(): number {
  return COMMENT_JITTER_MIN_MS + Math.random() * COMMENT_JITTER_RANGE_MS
}

function jitteredProcessAfter(kind: 'messaging' | 'comment'): string {
  if (kind !== 'comment') return new Date().toISOString()
  const delay = COMMENT_JITTER_MIN_MS + Math.random() * COMMENT_JITTER_RANGE_MS
  return new Date(Date.now() + delay).toISOString()
}

/** Formato dos eventos que a Meta entrega. Tudo opcional: o payload varia por tipo. */
export interface MessagingValue {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    quick_reply?: { payload?: string }
    reply_to?: { story?: unknown; mid?: string }
    /**
     * Anexos da mensagem. Hoje só nos interessa o tipo `story_mention` —
     * quando alguém marca a conta num story dela. Vem sem texto, só o anexo.
     */
    attachments?: Array<{ type?: string; payload?: { url?: string } }>
  }
  postback?: { mid?: string; title?: string; payload?: string }
}

export interface CommentValue {
  id?: string
  text?: string
  from?: { id?: string; username?: string }
  media?: { id?: string; media_product_type?: string }
  parent_id?: string
}

/** Um item do webhook: ou uma mensagem, ou uma mudança de comentário. */
type QueuedEvent =
  | { dedupKey: string; igAccountId: string; kind: 'messaging'; value: MessagingValue }
  | { dedupKey: string; igAccountId: string; kind: 'comment'; value: CommentValue }

interface WebhookPayload {
  object?: string
  entry?: Array<{
    id: string
    time?: number
    messaging?: MessagingValue[]
    changes?: Array<{ field: string; value: CommentValue }>
  }>
}

/**
 * Quebra o payload da Meta em eventos individuais.
 * dedup_key evita processar duas vezes quando a Meta reentrega (ela reentrega).
 */
export function flattenPayload(payload: WebhookPayload): QueuedEvent[] {
  const events: QueuedEvent[] = []

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const mid: string | undefined = messaging.message?.mid ?? messaging.postback?.mid
      if (!mid) continue
      events.push({
        dedupKey: `msg:${mid}`,
        igAccountId: entry.id,
        kind: 'messaging',
        value: messaging,
      })
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== 'comments') continue
      const commentId: string | undefined = change.value?.id
      if (!commentId) continue
      events.push({
        dedupKey: `comment:${commentId}`,
        igAccountId: entry.id,
        kind: 'comment',
        value: change.value,
      })
    }
  }

  return events
}

/**
 * Grava os eventos na fila.
 *
 * LANÇA se a gravação falhar — e isso é contrato, não detalhe. O `upsert()` do
 * supabase-js não lança em erro do PostgREST: ele RESOLVE com `{ error }`.
 * Enquanto esse retorno era ignorado, uma falha de banco (payload grande,
 * timeout, pool esgotado) sumia com o lote inteiro sem erro e sem log, e o
 * polling seguia gravando o cursor por cima — aquela janela de comentários
 * nunca mais era varrida e o tick respondia `ok:true`.
 *
 * Lança em vez de devolver `{ error }` justamente porque devolver era o bug:
 * retorno se ignora por acidente, exceção não. Quem chama tem duas saídas
 * legítimas — deixar subir (o polling faz isso, e assim o cursor não avança e
 * o tick vira 503) ou capturar de propósito (o webhook loga e responde 200
 * assim mesmo, porque a Meta desativa webhook que falha demais).
 */
export async function enqueue(events: QueuedEvent[]): Promise<void> {
  if (events.length === 0) return

  const { error } = await supabaseAdmin.from('webhook_events').upsert(
    events.map((event) => ({
      dedup_key: event.dedupKey,
      payload: event as unknown as Record<string, unknown>,
      process_after: jitteredProcessAfter(event.kind),
    })),
    { onConflict: 'dedup_key', ignoreDuplicates: true },
  )

  if (error) {
    throw new Error(`Não consegui enfileirar ${events.length} evento(s): ${error.message}`)
  }
}

async function getAccount(igUserId: string): Promise<Account | null> {
  const { data } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('ig_user_id', igUserId)
    .eq('is_active', true)
    .maybeSingle()

  return (data as Account | null) ?? null
}

/**
 * Perfil (nome, foto, seguidores, selo) só é revalidado a cada 24h — nunca a
 * cada DM. A conta troca dezenas de mensagens com o mesmo contato numa
 * conversa ativa; bater na Graph API em toda mensagem seria custo e latência
 * sem ganho. 24h ainda mantém a foto razoavelmente fresca no momento em que
 * importa: quando a pessoa escreve de novo é justamente quando o inbox vai
 * ser aberto para responder. Ver migration 0012 para o resto do plano
 * (fallback de iniciais no cliente cobre o que ficar velho entre uma
 * revalidação e outra).
 */
const PROFILE_REFRESH_MS = 24 * 60 * 60 * 1000

function profileFields(profile: NonNullable<Awaited<ReturnType<typeof fetchContactProfile>>>) {
  return {
    profile_pic_url: profile.profile_pic ?? null,
    follower_count: profile.follower_count ?? null,
    is_verified: profile.is_verified_user ?? false,
    profile_synced_at: new Date().toISOString(),
  }
}

async function upsertContact(args: {
  account: Account
  igUserId: string
  username?: string | null
  markInbound: boolean
  source?: { type: 'comment' | 'ref' | 'ad'; id: string }
}): Promise<Contact> {
  const { data: existing } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('account_id', args.account.id)
    .eq('ig_user_id', args.igUserId)
    .maybeSingle()

  if (existing) {
    const existingContact = existing as Contact
    const patch: Record<string, unknown> = {}
    if (args.markInbound) patch.last_inbound_at = new Date().toISOString()
    if (args.username && !existingContact.username) patch.username = args.username

    // Primeiro toque manda: só preenche origem se ainda estiver vazia.
    if (args.source && !existingContact.source_type) {
      patch.source_type = args.source.type
      patch.source_id = args.source.id
      patch.source_at = new Date().toISOString()
    }

    // Só quem manda DM dá consentimento de perfil — comentário não. E só
    // revalida se o cache já envelheceu (ver PROFILE_REFRESH_MS acima).
    const syncedAt = existingContact.profile_synced_at
      ? new Date(existingContact.profile_synced_at).getTime()
      : 0
    if (args.markInbound && Date.now() - syncedAt > PROFILE_REFRESH_MS) {
      const profile = await fetchContactProfile({
        accessToken: args.account.access_token,
        contactIgId: args.igUserId,
      }).catch(() => null)

      if (profile) {
        if (profile.username && !existingContact.username) patch.username = profile.username
        if (profile.name && !existingContact.name) patch.name = profile.name
        Object.assign(patch, profileFields(profile))
      }
    }

    if (Object.keys(patch).length > 0) {
      const { data: updated } = await supabaseAdmin
        .from('contacts')
        .update(patch)
        .eq('id', existingContact.id)
        .select()
        .single()
      return updated as Contact
    }
    return existing as Contact
  }

  // Perfil só é acessível depois que o contato manda mensagem para a conta.
  const profile = args.markInbound
    ? await fetchContactProfile({
        accessToken: args.account.access_token,
        contactIgId: args.igUserId,
      }).catch(() => null)
    : null

  const { data: created, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      account_id: args.account.id,
      ig_user_id: args.igUserId,
      username: profile?.username ?? args.username ?? null,
      name: profile?.name ?? null,
      last_inbound_at: args.markInbound ? new Date().toISOString() : null,
      source_type: args.source?.type ?? null,
      source_id: args.source?.id ?? null,
      source_at: args.source ? new Date().toISOString() : null,
      ...(profile ? profileFields(profile) : {}),
    })
    .select()
    .single()

  if (error || !created) throw new Error(`Não consegui criar contato: ${error?.message}`)
  return created as Contact
}

async function loadFlow(flowId: string): Promise<Flow | null> {
  const { data } = await supabaseAdmin.from('flows').select('*').eq('id', flowId).maybeSingle()
  return (data as Flow | null) ?? null
}

/**
 * Grava QUAL botão a pessoa apertou.
 *
 * O funil por bloco (`flow_node_events`) já sabia que ela passou pelo bloco de
 * botões, e não qual das opções escolheu — mas é justamente a diferença entre
 * "Quero o mapa" e "Depois eu vejo" que diz o que escrever no próximo post.
 *
 * A origem (fluxo + nó) é reconstruída a partir do payload, porque a Meta
 * manda só ele. Payload sem origem clara ainda registra o clique com os campos
 * nulos: perder a linha seria pior que não saber de onde ela veio (ver a regra
 * completa em `resolveButtonSource`).
 *
 * Nunca lança. Métrica é acessório, entrega não — mesmo contrato do registro
 * de nó no engine. É também o que faz este código sobreviver enquanto a tabela
 * `button_clicks` não existe no banco: o erro do PostgREST vira log e o
 * webhook segue entregando.
 */
async function recordButtonClick(args: {
  account: Account
  contact: Contact
  payload: string
  /** Rótulo que a própria Meta devolve no postback. Só vale se a definição não souber. */
  fallbackTitle?: string
}): Promise<void> {
  const { data } = await supabaseAdmin
    .from('flows')
    .select('id, definition')
    .eq('account_id', args.account.id)

  const source = resolveButtonSource((data ?? []) as FlowDefinitionRow[], args.payload)

  const { error } = await supabaseAdmin.from('button_clicks').insert({
    account_id: args.account.id,
    contact_id: args.contact.id,
    flow_id: source.flowId,
    node_id: source.nodeId,
    payload: args.payload,
    // Copiado da definição AGORA: se o texto do botão mudar amanhã, o
    // histórico continua contando o que estava escrito no momento do clique.
    title: source.title ?? args.fallbackTitle ?? null,
  })

  if (error) console.error('[dm-flow] clique de botão não registrado:', error.message)
}

/**
 * Detecta o tipo de gatilho de um evento de messaging: menção em story
 * (anexo `story_mention`), resposta de story (`reply_to.story`) ou palavra
 * comum em DM. Exportada para teste — é a peça que nunca foi validada
 * ponta a ponta (`story_reply`) e a que fica pronta sem poder ser testada
 * contra dado real (`story_mention`, ver README/HANDOFF sobre o webhook).
 */
export function detectMessagingTriggerType(value: MessagingValue): TriggerType {
  const isStoryMention =
    value.message?.attachments?.some((attachment) => attachment.type === 'story_mention') ?? false
  if (isStoryMention) return 'story_mention'

  const isStoryReply = Boolean(value.message?.reply_to?.story)
  if (isStoryReply) return 'story_reply'

  return 'keyword'
}

export async function handleMessaging(account: Account, value: MessagingValue) {
  // Echo = mensagem que a própria conta enviou. Ignorar, senão o bot conversa sozinho.
  if (value.message?.is_echo) return

  const senderId: string | undefined = value.sender?.id
  if (!senderId || senderId === account.ig_user_id) return

  const rawText: string =
    value.message?.quick_reply?.payload ?? value.postback?.payload ?? value.message?.text ?? ''

  // Toque em botão chega diferente conforme o canal: pelo webhook vem o
  // `payload`, pelo polling vem o TÍTULO (o toque aparece como mensagem comum
  // em `/me/conversations`). Como o webhook nunca entregou nada aqui, na
  // prática o fluxo nunca via o payload — e uma condição escrita contra ele
  // pegava o caminho errado em silêncio. A tradução iguala os dois canais.
  const traduzido =
    value.message?.quick_reply?.payload || value.postback?.payload
      ? null
      : await payloadForText(account, rawText)
  const text = traduzido ?? rawText

  const triggerType = detectMessagingTriggerType(value)
  const isStoryMention = triggerType === 'story_mention'

  const contact = await upsertContact({ account, igUserId: senderId, markInbound: true })

  await supabaseAdmin.from('messages').upsert(
    {
      account_id: account.id,
      contact_id: contact.id,
      direction: 'in',
      mid: value.message?.mid ?? value.postback?.mid ?? null,
      text,
      payload: value,
    },
    { onConflict: 'mid', ignoreDuplicates: true },
  )

  // Toque em botão: registra a escolha sem bloquear o caminho da entrega.
  // Vale mesmo para o contato em atendimento humano e para o payload que não
  // casa gatilho nenhum — apertar o botão é o fato, e ele aconteceu.
  const clickedPayload: string | undefined =
    value.message?.quick_reply?.payload ?? value.postback?.payload ?? traduzido ?? undefined
  if (clickedPayload) {
    void recordButtonClick({
      account,
      contact,
      payload: clickedPayload,
      fallbackTitle: value.postback?.title,
    }).catch((error) => console.error('[dm-flow] clique de botão não registrado:', error))
  }

  // Sem texto e sem ser menção não há o que casar contra gatilho — mesmo
  // tratamento de sempre para figurinha/imagem sem legenda.
  if (!text && !isStoryMention) return

  // Contato em atendimento humano: a mensagem fica registrada para o inbox,
  // mas nenhum fluxo dispara nem retoma por cima da pessoa.
  if (contact.automation_paused) return

  // Fluxo esperando resposta tem prioridade sobre disparar um novo — mas só
  // faz sentido para texto de verdade. Uma menção não é resposta a um
  // wait_reply pendente, é um gatilho de entrada novo (e chega sem texto).
  if (text) {
    const { data: waiting } = await supabaseAdmin
      .from('flow_runs')
      .select('*')
      .eq('contact_id', contact.id)
      .eq('status', 'waiting_reply')
      .maybeSingle()

    if (waiting) {
      await resumeFlow({ run: waiting as FlowRun, account, contact, input: text })
      return
    }
  }

  const trigger = await findTrigger({ accountId: account.id, type: triggerType, text })
  if (!trigger) return

  const flow = await loadFlow(trigger.flow_id)
  if (!flow?.is_active) return

  await startFlow({ account, flow, contact, input: text })
}

async function handleComment(
  account: Account,
  value: CommentValue,
  /** Já publicamos resposta para este comentário numa tentativa anterior? */
  alreadyReplied = false,
  onPublicReply?: () => Promise<void>,
) {
  const fromId: string | undefined = value.from?.id
  const commentId: string | undefined = value.id
  const text: string = value.text ?? ''

  if (!fromId || !commentId) return
  // Comentário da própria conta (inclusive a resposta pública que o bot postou).
  if (fromId === account.ig_user_id) return

  const trigger = await findTrigger({
    accountId: account.id,
    type: 'comment',
    text,
    mediaId: value.media?.id,
  })
  if (!trigger) return

  const flow = await loadFlow(trigger.flow_id)
  if (!flow?.is_active) return

  const contact = await upsertContact({
    account,
    igUserId: fromId,
    username: value.from?.username ?? null,
    // Comentário não abre a janela de 24h de DM. Só a private reply passa.
    markInbound: false,
    // De qual post veio o lead — o dado já chegava aqui e era descartado.
    ...(value.media?.id ? { source: { type: 'comment' as const, id: value.media.id } } : {}),
  })

  if (contact.automation_paused) return

  // Só publica uma vez por comentário. O retry do evento não pode republicar:
  // comentário repetido é padrão de spam para o Instagram.
  if (trigger.public_reply && !alreadyReplied) {
    const mediaId = value.media?.id
    const message = spin(trigger.public_reply)

    // TODO comentário é respondido. Passando do teto do post, a resposta vai
    // para a fila em vez de ser descartada — sai depois, espaçada. A DM segue
    // na hora: conversa privada não incomoda ninguém, parede de comentários
    // iguais no mesmo post sim.
    const withinPostCap = mediaId ? await isUnderPublicReplyCap(account.id, mediaId) : true

    try {
      if (!withinPostCap) {
        await supabaseAdmin.from('pending_public_replies').upsert(
          { account_id: account.id, comment_id: commentId, media_id: mediaId ?? null, message },
          { onConflict: 'comment_id', ignoreDuplicates: true },
        )
      } else {
        await assertUnderSendCap(account.id)
        await replyToComment({ accessToken: account.access_token, commentId, message })
        await logSend(account.id, 'public_reply', mediaId)
      }
      // Marca ANTES de seguir: se o fluxo falhar depois, o retry já sabe.
      await onPublicReply?.()
    } catch (error) {
      // Cap global ou API fora: enfileira para não perder a resposta.
      console.error('[dm-flow] resposta pública adiada:', error)
      await supabaseAdmin.from('pending_public_replies').upsert(
        { account_id: account.id, comment_id: commentId, media_id: mediaId ?? null, message },
        { onConflict: 'comment_id', ignoreDuplicates: true },
      )
      await onPublicReply?.()
    }
  }

  await startFlow({ account, flow, contact, commentId, input: text })
}

/**
 * Título de botão → payload declarado, lendo os fluxos da conta.
 *
 * Separado em função com acesso ao banco porque `payloadForTitle` é puro (e
 * testado como tal). Falha de leitura devolve nulo: o texto original segue seu
 * caminho, que é o comportamento de antes desta tradução existir.
 */
async function payloadForText(account: Account, text: string): Promise<string | null> {
  if (!text.trim()) return null

  const { data, error } = await supabaseAdmin
    .from('flows')
    .select('id, definition')
    .eq('account_id', account.id)

  if (error || !data) return null
  return payloadForTitle(data as FlowDefinitionRow[], text)
}

/**
 * Orçamento de retentativa de um evento.
 *
 * Eram 3 tentativas seguidas, o que dá ~3 minutos de horizonte — e isso furou
 * a invariante "todo comentário é respondido, nem que demore" em 30/07/2026:
 * o token do Instagram caiu por 22 horas, dois comentários queimaram as três
 * tentativas nos primeiros minutos e ficaram `failed` para sempre, sem
 * aparecer em lugar nenhum do painel.
 *
 * Agora a espera dobra a cada tentativa até um teto de 6h, e são 12 tentativas
 * — o horizonte passa de 24 horas. Uma queda de um dia inteiro deixa de matar
 * o comentário: quando o token volta, a fila drena sozinha.
 *
 * Retentativa é segura porque `public_reply_sent` já marca o que saiu; o
 * evento reprocessado não responde o mesmo comentário duas vezes.
 */
const MAX_ATTEMPTS = 12
const RETRY_BASE_MS = 60_000
const RETRY_CAP_MS = 6 * 60 * 60 * 1000

export function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_CAP_MS)
}

/**
 * Pega eventos pendentes e processa. Chamado pelo webhook via after()
 * e pelo cron (que também recolhe o que travou em 'processing').
 */
export async function processPending(limit = 20): Promise<number> {
  const { data } = await supabaseAdmin
    .from('webhook_events')
    .select('*')
    .eq('status', 'pending')
    .lte('process_after', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)

  const rows = data ?? []
  let processed = 0

  for (const row of rows) {
    // Claim otimista: só processa quem conseguiu virar o status de pending.
    const { data: claimed } = await supabaseAdmin
      .from('webhook_events')
      // process_after vira a hora do claim: é ela que requeueStuckEvents mede.
      .update({
        status: 'processing',
        attempts: row.attempts + 1,
        process_after: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claimed) continue

    const event = row.payload as QueuedEvent

    try {
      const account = await getAccount(event.igAccountId)
      if (!account) throw new Error(`Conta ${event.igAccountId} não conectada.`)

      // Pânico ligado: o evento volta para a fila e espera ser destravado,
      // em vez de ser processado ou perdido.
      if (account.automations_paused) {
        await supabaseAdmin
          .from('webhook_events')
          .update({
            status: 'pending',
            // Devolve a tentativa: adiar não é falhar, senão o pânico ligado
            // por um tempo queimaria o orçamento de retentativas do evento.
            attempts: row.attempts,
            process_after: new Date(Date.now() + 60_000).toISOString(),
          })
          .eq('id', row.id)
        continue
      }

      // Fora do horário de atendimento: adia para a abertura, não descarta.
      if (isQuiet(account)) {
        // Jitter na abertura, não só na entrada da fila. `nextOpening` zera os
        // minutos, então TODOS os eventos acumulados na madrugada recebiam
        // exatamente o mesmo `process_after` e disparavam juntos às 08:00:00.
        // Quarenta private replies no mesmo segundo, todo dia, é assinatura de
        // robô — e o cap limita o volume, não o padrão.
        const abertura = nextOpening(account).getTime()
        await supabaseAdmin
          .from('webhook_events')
          .update({
            status: 'pending',
            attempts: row.attempts,
            process_after: new Date(abertura + jitterMs()).toISOString(),
          })
          .eq('id', row.id)
        continue
      }

      if (event.kind === 'messaging') {
        await handleMessaging(account, event.value)
      } else {
        await handleComment(account, event.value, row.public_reply_sent, async () => {
          await supabaseAdmin
            .from('webhook_events')
            .update({ public_reply_sent: true })
            .eq('id', row.id)
        })
      }

      await supabaseAdmin
        .from('webhook_events')
        .update({ status: 'done', processed_at: new Date().toISOString(), error: null })
        .eq('id', row.id)
      processed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[dm-flow] evento falhou:', row.dedup_key, message)

      const attempts = row.attempts + 1
      // Erro permanente (payload inválido, política da Meta, token morto) não
      // melhora com insistência: retentar reexecuta o fluxo e só gasta
      // orçamento de envio com mensagem que a Meta vai recusar de novo.
      const desistiu = attempts >= MAX_ATTEMPTS || isPermanentError(error)

      await supabaseAdmin
        .from('webhook_events')
        .update({
          status: desistiu ? 'failed' : 'pending',
          error: message,
          // Espera crescente: erro transitório (token caído, Meta instável)
          // não pode queimar o orçamento inteiro em três minutos.
          ...(desistiu
            ? {}
            : { process_after: new Date(Date.now() + retryDelayMs(attempts)).toISOString() }),
        })
        .eq('id', row.id)
    }
  }

  return processed
}
