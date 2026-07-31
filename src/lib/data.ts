import 'server-only'

import { computeDayTrend, dayWindows, type DayTrend } from '@/lib/day-trend'
import { dailyBuckets, hourlyBuckets, type SeriesBucket } from '@/lib/series'
import { env } from '@/lib/env'
import { DISMISSED_ERROR_PREFIX } from '@/lib/flow/dismissed'
import { fetchMedia } from '@/lib/instagram/api'
import { assessRisk } from '@/lib/risk/assess'
import type { RiskReport } from '@/lib/risk/types'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Account, CannedReply, Contact, Flow, Trigger } from '@/types/db'

/**
 * Uma "automação" na UI é o par trigger + flow — a mesma ideia do ManyChat,
 * onde você escolhe o gatilho e desenha o que acontece depois.
 */
export interface Automation {
  trigger: Trigger
  flow: Flow
  stats: { runs: number; done: number }
}

export async function getAccount(): Promise<Account | null> {
  const { data } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  return (data as Account | null) ?? null
}

export async function getAutomations(): Promise<Automation[]> {
  const [{ data: triggers }, { data: flows }, { data: runs }] = await Promise.all([
    supabaseAdmin.from('triggers').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('flows').select('*'),
    supabaseAdmin.from('flow_runs').select('flow_id, status'),
  ])

  const flowById = new Map((flows ?? []).map((f) => [f.id, f as Flow]))

  return ((triggers ?? []) as Trigger[]).flatMap((trigger) => {
    const flow = flowById.get(trigger.flow_id)
    if (!flow) return []

    const mine = (runs ?? []).filter((r) => r.flow_id === flow.id)
    return [
      {
        trigger,
        flow,
        stats: { runs: mine.length, done: mine.filter((r) => r.status === 'done').length },
      },
    ]
  })
}

export async function getAutomation(triggerId: string): Promise<Automation | null> {
  const { data: trigger } = await supabaseAdmin
    .from('triggers')
    .select('*')
    .eq('id', triggerId)
    .maybeSingle()

  if (!trigger) return null

  const { data: flow } = await supabaseAdmin
    .from('flows')
    .select('*')
    .eq('id', (trigger as Trigger).flow_id)
    .maybeSingle()

  if (!flow) return null

  const { data: runs } = await supabaseAdmin
    .from('flow_runs')
    .select('status')
    .eq('flow_id', (flow as Flow).id)

  return {
    trigger: trigger as Trigger,
    flow: flow as Flow,
    stats: {
      runs: runs?.length ?? 0,
      done: runs?.filter((r) => r.status === 'done').length ?? 0,
    },
  }
}

export interface FlowOption {
  id: string
  name: string
}

/**
 * Lista enxuta (id + nome) para o seletor do bloco "pular para outro fluxo" —
 * carregada no servidor e passada por props até o inspetor de nós, nunca via
 * fetch no cliente. Quem chama decide se filtra o fluxo atual da lista.
 */
export async function getFlowOptions(): Promise<FlowOption[]> {
  const { data } = await supabaseAdmin
    .from('flows')
    .select('id, name')
    .order('name')

  return (data ?? []) as FlowOption[]
}

export interface LeadSource {
  mediaId: string
  leads: number
  /** Preenchido quando o post ainda existe na conta. */
  permalink?: string
  thumbnail?: string
  caption?: string
}

/**
 * Quais conteúdos mais trazem lead. Cruza a origem gravada no contato com
 * os posts da conta para mostrar miniatura e legenda em vez do id cru.
 * Post apagado ou fora das últimas 50 mídias continua listado, só sem enfeite.
 */
export async function getLeadSources(limit = 8): Promise<LeadSource[]> {
  const { data } = await supabaseAdmin
    .from('contacts')
    .select('source_id')
    .eq('source_type', 'comment')
    .not('source_id', 'is', null)

  const rows = (data ?? []) as Array<{ source_id: string }>
  if (rows.length === 0) return []

  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1)

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  // fetchMedia direto (e não loadMedia) porque lib/media importa daqui —
  // usar de lá fecharia um ciclo de import.
  const account = await getAccount()
  const media = account
    ? await fetchMedia({
        igUserId: account.ig_user_id,
        accessToken: account.access_token,
        limit: 50,
      }).catch(() => [])
    : []

  const byId = new Map(media.map((item) => [item.id, item]))

  return ranked.map(([mediaId, leads]) => {
    const item = byId.get(mediaId)
    return {
      mediaId,
      leads,
      permalink: item?.permalink,
      thumbnail: item?.thumbnail_url ?? item?.media_url,
      caption: item?.caption,
    }
  })
}

export interface NodeMetric {
  nodeId: string
  nodeType: string
  people: number
  /** % de quem entrou no fluxo que chegou até aqui. */
  share: number
}

/**
 * Funil do fluxo: quantas pessoas distintas passaram por cada bloco.
 * Distinto por contato porque um nó pode repetir (a repergunta do `ask`).
 */
export async function getFlowMetrics(flowId: string): Promise<NodeMetric[]> {
  const { data } = await supabaseAdmin
    .from('flow_node_events')
    .select('node_id, node_type, contact_id')
    .eq('flow_id', flowId)
    .limit(10000)

  const rows = (data ?? []) as Array<{ node_id: string; node_type: string; contact_id: string }>
  if (rows.length === 0) return []

  const byNode = new Map<string, { type: string; contacts: Set<string> }>()
  for (const row of rows) {
    const entry = byNode.get(row.node_id) ?? { type: row.node_type, contacts: new Set<string>() }
    entry.contacts.add(row.contact_id)
    byNode.set(row.node_id, entry)
  }

  const top = Math.max(...[...byNode.values()].map((entry) => entry.contacts.size))

  return [...byNode.entries()]
    .map(([nodeId, entry]) => ({
      nodeId,
      nodeType: entry.type,
      people: entry.contacts.size,
      share: top > 0 ? Math.round((entry.contacts.size / top) * 100) : 0,
    }))
    .sort((a, b) => b.people - a.people)
}

export interface ButtonChoice {
  payload: string
  /** Rótulo mais recente gravado para este payload. Null quando nunca deu para saber. */
  title: string | null
  clicks: number
}

export interface NodeButtonClicks {
  /** Null junta os cliques cuja origem ficou ambígua dentro do fluxo. */
  nodeId: string | null
  clicks: number
  choices: ButtonChoice[]
}

/**
 * Qual botão do fluxo foi apertado, agrupado por bloco e por payload.
 *
 * O agrupamento por bloco é o ponto: um bloco com três botões só responde à
 * pergunta que interessa ("o que essa gente escolheu?") quando as três opções
 * são lidas juntas, uma contra a outra. Três contagens soltas numa lista
 * global não diriam nada — 40 cliques é muito ou pouco depende do que o outro
 * botão do mesmo bloco tirou.
 *
 * Dentro do bloco, a chave é o `payload`, não o `title`: o payload é a
 * identidade da escolha e o rótulo é só como ela estava escrita. Renomear
 * "Quero o mapa" para "Pegar o mapa" não pode partir a série em duas, então o
 * rótulo mostrado é o do clique mais recente e a contagem continua inteira.
 *
 * Devolve lista vazia quando a tabela ainda não existe no banco — a migration
 * é rodada à mão e a tela não pode quebrar até lá.
 */
export async function getButtonClicks(flowId: string): Promise<NodeButtonClicks[]> {
  const { data, error } = await supabaseAdmin
    .from('button_clicks')
    .select('node_id, payload, title, created_at')
    .eq('flow_id', flowId)
    .order('created_at', { ascending: false })
    .limit(10000)

  if (error) {
    console.error('[dm-flow] cliques de botão indisponíveis:', error.message)
    return []
  }

  const rows = (data ?? []) as Array<{
    node_id: string | null
    payload: string
    title: string | null
  }>
  if (rows.length === 0) return []

  const byNode = new Map<string, Map<string, ButtonChoice>>()

  for (const row of rows) {
    const nodeKey = row.node_id ?? ''
    const choices = byNode.get(nodeKey) ?? new Map<string, ButtonChoice>()
    const choice = choices.get(row.payload) ?? { payload: row.payload, title: null, clicks: 0 }

    choice.clicks += 1
    // Linhas vêm da mais nova para a mais velha, então o primeiro rótulo não
    // nulo que aparece é o mais recente.
    if (choice.title === null) choice.title = row.title

    choices.set(row.payload, choice)
    byNode.set(nodeKey, choices)
  }

  return [...byNode.entries()]
    .map(([nodeKey, choices]) => {
      const list = [...choices.values()].sort((a, b) => b.clicks - a.clicks)
      return {
        nodeId: nodeKey === '' ? null : nodeKey,
        clicks: list.reduce((total, choice) => total + choice.clicks, 0),
        choices: list,
      }
    })
    .sort((a, b) => b.clicks - a.clicks)
}

export interface DashboardStats {
  contacts: number
  automations: number
  activeAutomations: number
  messagesSent: number
  runsRunning: number
}

export async function getStats(): Promise<DashboardStats> {
  const [contacts, triggers, activeTriggers, sent, running] = await Promise.all([
    supabaseAdmin.from('contacts').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('triggers').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('triggers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'out'),
    supabaseAdmin
      .from('flow_runs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['running', 'waiting_reply', 'sleeping']),
  ])

  return {
    contacts: contacts.count ?? 0,
    automations: triggers.count ?? 0,
    activeAutomations: activeTriggers.count ?? 0,
    messagesSent: sent.count ?? 0,
    runsRunning: running.count ?? 0,
  }
}

const DM_WINDOW_MS = 24 * 60 * 60 * 1000

/** `windowOpen` é calculado aqui para a página não precisar de relógio no render. */
export type ContactRow = Contact & { windowOpen: boolean }

export async function getContacts(
  options: { search?: string; tag?: string; sourceId?: string; limit?: number } = {},
): Promise<ContactRow[]> {
  let query = supabaseAdmin.from('contacts').select('*')

  if (options.sourceId) query = query.eq('source_id', options.sourceId)

  const search = options.search?.trim()
  if (search) {
    // `,` separa os OR do PostgREST, então vírgula na busca quebraria a query.
    const safe = search.replace(/[,()]/g, ' ').trim()
    if (safe) query = query.or(`username.ilike.%${safe}%,name.ilike.%${safe}%`)
  }

  if (options.tag) query = query.contains('tags', [options.tag])

  const { data } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(options.limit ?? 100)

  const now = Date.now()
  return ((data ?? []) as Contact[]).map((contact) => ({
    ...contact,
    windowOpen: contact.last_inbound_at
      ? now - new Date(contact.last_inbound_at).getTime() < DM_WINDOW_MS
      : false,
  }))
}

/** Todas as etiquetas em uso, para o filtro da lista. */
export async function getAllTags(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('contacts').select('tags')
  const tags = new Set<string>()
  for (const row of (data ?? []) as Array<{ tags: string[] }>) {
    for (const tag of row.tags ?? []) tags.add(tag)
  }
  return [...tags].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export interface ContactDetail {
  contact: ContactRow
  messages: ThreadMessage[]
  runs: Array<{ id: string; status: string; created_at: string; flowName: string }>
}

export async function getContactDetail(contactId: string): Promise<ContactDetail | null> {
  const thread = await getThread(contactId, 30)
  if (!thread) return null

  const { data: runs } = await supabaseAdmin
    .from('flow_runs')
    .select('id, status, created_at, flows(name)')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(20)

  return {
    contact: thread.contact,
    messages: thread.messages,
    runs: ((runs ?? []) as unknown as Array<{
      id: string
      status: string
      created_at: string
      flows: { name: string } | null
    }>).map(({ flows, ...rest }) => ({ ...rest, flowName: flows?.name ?? 'fluxo removido' })),
  }
}

export interface InboxItem {
  contact: ContactRow
  lastMessage: { text: string | null; direction: 'in' | 'out'; created_at: string } | null
}

/**
 * Lista do inbox: contatos ordenados pela última mensagem. A prévia vem de uma
 * segunda query reduzida em memória — o volume é de uso próprio, não vale um
 * lateral join via PostgREST.
 */
export type InboxFilter = 'abertas' | 'nao-lidas' | 'adiadas' | 'resolvidas'

export async function getInbox(
  filter: InboxFilter = 'abertas',
  limit = 50,
): Promise<InboxItem[]> {
  let query = supabaseAdmin.from('contacts').select('*').not('last_message_at', 'is', null)

  const nowIso = new Date().toISOString()

  if (filter === 'nao-lidas') {
    query = query.gt('unread_count', 0)
  } else if (filter === 'adiadas') {
    query = query.eq('inbox_status', 'snoozed').gt('snooze_until', nowIso)
  } else if (filter === 'resolvidas') {
    query = query.eq('inbox_status', 'done')
  } else {
    // Abertas inclui adiadas cujo prazo já venceu — senão elas somem para sempre.
    query = query.or(`inbox_status.eq.open,and(inbox_status.eq.snoozed,snooze_until.lte.${nowIso})`)
  }

  const { data } = await query
    .order('last_message_at', { ascending: false })
    .limit(limit)

  const contacts = (data ?? []) as Contact[]
  if (contacts.length === 0) return []

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('contact_id, text, direction, created_at')
    .in(
      'contact_id',
      contacts.map((c) => c.id),
    )
    .order('created_at', { ascending: false })
    .limit(limit * 6)

  const lastByContact = new Map<string, InboxItem['lastMessage']>()
  for (const message of messages ?? []) {
    if (!message.contact_id || lastByContact.has(message.contact_id)) continue
    lastByContact.set(message.contact_id, {
      text: message.text,
      direction: message.direction,
      created_at: message.created_at,
    })
  }

  const now = Date.now()
  return contacts.map((contact) => ({
    contact: {
      ...contact,
      windowOpen: contact.last_inbound_at
        ? now - new Date(contact.last_inbound_at).getTime() < DM_WINDOW_MS
        : false,
    },
    lastMessage: lastByContact.get(contact.id) ?? null,
  }))
}

export async function getCannedReplies(): Promise<CannedReply[]> {
  const { data } = await supabaseAdmin
    .from('canned_replies')
    .select('*')
    .order('title')

  return (data ?? []) as CannedReply[]
}

/** Contadores dos filtros, para as abas mostrarem quanto tem em cada fila. */
export async function getInboxCounts(): Promise<Record<InboxFilter, number>> {
  const now = new Date().toISOString()

  const [abertas, naoLidas, adiadas, resolvidas] = await Promise.all([
    supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .not('last_message_at', 'is', null)
      .or(`inbox_status.eq.open,and(inbox_status.eq.snoozed,snooze_until.lte.${now})`),
    supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gt('unread_count', 0),
    supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('inbox_status', 'snoozed')
      .gt('snooze_until', now),
    supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('inbox_status', 'done'),
  ])

  return {
    abertas: abertas.count ?? 0,
    'nao-lidas': naoLidas.count ?? 0,
    adiadas: adiadas.count ?? 0,
    resolvidas: resolvidas.count ?? 0,
  }
}

export interface ThreadMessage {
  id: string
  direction: 'in' | 'out'
  text: string | null
  source: 'flow' | 'manual'
  created_at: string
}

export interface Thread {
  contact: ContactRow
  messages: ThreadMessage[]
}

export async function getThread(contactId: string, limit = 100): Promise<Thread | null> {
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .maybeSingle()

  if (!contact) return null

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('id, direction, text, source, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  const row = contact as Contact
  return {
    contact: {
      ...row,
      windowOpen: row.last_inbound_at
        ? Date.now() - new Date(row.last_inbound_at).getTime() < DM_WINDOW_MS
        : false,
    },
    messages: ((messages ?? []) as ThreadMessage[]).slice().reverse(),
  }
}

export interface ConversationRow {
  id: string
  direction: 'in' | 'out'
  text: string | null
  created_at: string
  contact: { username: string | null; ig_user_id: string } | null
}

export async function getRecentMessages(limit = 60): Promise<ConversationRow[]> {
  const { data } = await supabaseAdmin
    .from('messages')
    .select('id, direction, text, created_at, contacts(username, ig_user_id)')
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as Array<
    Omit<ConversationRow, 'contact'> & {
      contacts: { username: string | null; ig_user_id: string } | null
    }
  >).map(({ contacts, ...rest }) => ({ ...rest, contact: contacts }))
}

const HOUR_MS = 60 * 60 * 1000
const RISK_LOOKBACK_MS = 24 * HOUR_MS
/** Quantas mensagens de saída da automação entram na conta de similaridade. */
const SIMILARITY_SAMPLE = 40

/**
 * Monitor de risco de flag: junta volume, similaridade de texto, concentração
 * no tempo, proporção de resposta pública e envios de madrugada num semáforo
 * só. A lógica de corte mora em `src/lib/risk` — pura, testada, sem I/O; esta
 * função só lê o banco e alimenta ela. Sem conta conectada não tem o que medir.
 */
export async function getRiskReport(): Promise<RiskReport | null> {
  const account = await getAccount()
  if (!account) return null

  const since24h = new Date(Date.now() - RISK_LOOKBACK_MS).toISOString()
  const since1h = new Date(Date.now() - HOUR_MS).toISOString()

  const [{ data: sends }, { data: outgoing }] = await Promise.all([
    supabaseAdmin
      .from('send_log')
      .select('kind, created_at')
      .eq('account_id', account.id)
      .gte('created_at', since24h),
    // source = 'flow': o que a automação mandou, não resposta manual de
    // atendente — o risco de flag é sobre repetição do bot, não de gente.
    supabaseAdmin
      .from('messages')
      .select('text')
      .eq('account_id', account.id)
      .eq('direction', 'out')
      .eq('source', 'flow')
      .order('created_at', { ascending: false })
      .limit(SIMILARITY_SAMPLE),
  ])

  const sendRows = (sends ?? []) as Array<{ kind: string; created_at: string }>
  const hourlyRows = sendRows.filter((row) => row.created_at >= since1h)

  const recentSendCounts = {
    dm: sendRows.filter((row) => row.kind === 'dm').length,
    privateReply: sendRows.filter((row) => row.kind === 'private_reply').length,
    publicReply: sendRows.filter((row) => row.kind === 'public_reply').length,
  }

  const recentOutgoingTexts = ((outgoing ?? []) as Array<{ text: string | null }>)
    .map((row) => row.text ?? '')
    .filter((text) => text.length > 0)

  return assessRisk({
    cap: env.SEND_HOURLY_CAP,
    sendsLastHour: hourlyRows.length,
    hourlySendTimestamps: hourlyRows.map((row) => new Date(row.created_at)),
    recentOutgoingTexts,
    recentSendCounts,
    recentSendTimestamps: sendRows.map((row) => new Date(row.created_at)),
    account: { quiet_from: account.quiet_from, quiet_to: account.quiet_to },
  })
}

// ---------------------------------------------------------------------------
// Cockpit: as perguntas que o painel deveria responder ao abrir, em vez dos
// quatro números de vaidade de sempre. Cada leitura abaixo é dedicada a UMA
// pergunta — ver `getCockpitData` no fim, que junta todas numa chamada só
// para a página compor.
// ---------------------------------------------------------------------------

/**
 * "Quantos leads entraram hoje, contra ontem?" — tendência, não total
 * histórico. `dayWindows`/`computeDayTrend` (src/lib/day-trend.ts) são puros
 * e testados; aqui só viram duas contagens `head: true` (sem puxar linha
 * nenhuma) nos limites do dia civil em America/Sao_Paulo.
 */
export async function getLeadsTrend(): Promise<DayTrend> {
  const { todayStart, tomorrowStart, yesterdayStart } = dayWindows()

  const [today, yesterday] = await Promise.all([
    supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())
      .lt('created_at', tomorrowStart.toISOString()),
    supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayStart.toISOString()),
  ])

  return computeDayTrend(today.count ?? 0, yesterday.count ?? 0)
}

/** Janela do gráfico de leads. 30 dias cabe na largura do card sem virar risco de cabelo. */
const LEADS_SERIES_DAYS = 30
/** Envios por hora: 24h é o ciclo que interessa, e casa com a janela de DM. */
const SENDS_SERIES_HOURS = 24
/**
 * Teto de linhas puxadas para montar uma série. Passar disso significaria
 * volume muito acima do cap por hora — aí o gráfico já não é o problema.
 */
const SERIES_ROW_LIMIT = 5000

/**
 * Leads por dia. Conta contato criado, que é o primeiro toque — o mesmo
 * critério de `getLeadsTrend`, para o número grande e a curva não divergirem.
 */
export async function getLeadsSeries(days = LEADS_SERIES_DAYS): Promise<SeriesBucket[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabaseAdmin
    .from('contacts')
    .select('created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(SERIES_ROW_LIMIT)

  return dailyBuckets((data ?? []).map((row) => (row as { created_at: string }).created_at), days)
}

/**
 * Envios por hora nas últimas 24h, com o cap marcado.
 *
 * É o gráfico mais operacional do painel: o cap e o relatório de risco dizem
 * "0 de 60 na última hora" sem mostrar o FORMATO da curva, e é o formato que
 * denuncia disparo concentrado — exatamente o padrão que custou restrição de
 * conta em jul/2026 (ver a blindagem anti-spam no CLAUDE.md).
 */
export async function getSendsSeries(hours = SENDS_SERIES_HOURS): Promise<{
  points: SeriesBucket[]
  cap: number
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data } = await supabaseAdmin
    .from('send_log')
    .select('created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(SERIES_ROW_LIMIT)

  return {
    points: hourlyBuckets(
      (data ?? []).map((row) => (row as { created_at: string }).created_at),
      hours,
    ),
    cap: env.SEND_HOURLY_CAP,
  }
}

/** Depois desse tanto sem resposta a janela de 24h já fechou — a conversa não reabre sozinha. */
const STALE_WAITING_REPLY_MS = 24 * 60 * 60 * 1000
/**
 * "Falha ainda não dispensada", num `or` só — dois `or` empilhados na mesma
 * query dependeriam de o PostgREST juntá-los com AND, o que não é garantido.
 * O ramo `error.is.null` é obrigatório: `NOT LIKE` contra NULL dá NULL, então
 * sem ele toda falha SEM texto de erro sumiria do painel em silêncio.
 */
const NOT_DISMISSED = `error.is.null,error.not.ilike.${DISMISSED_ERROR_PREFIX}*`
/** Teto de linhas puxadas só para achar qual automação concentra mais gente travada. */
const STUCK_SAMPLE_LIMIT = 500

export interface StuckSummary {
  /** Fluxo que quebrou no meio (`flow_runs.status = 'failed'`) — nunca mais anda sozinho. */
  failed: number
  /** Parado em `wait_reply`/`ask` há mais de 24h — recebeu a DM e não voltou. */
  staleWaitingReply: number
  total: number
  /** A automação com mais gente travada, para o card linkar direto pra ela. */
  topAutomation: { triggerId: string; flowName: string; count: number } | null
}

/**
 * "Quantos travaram no meio?" — dinheiro parado: gente que o fluxo não
 * conseguiu levar até o fim. Duas contagens `head: true` cobrem o total; só
 * quando há alguém travado é que uma terceira query busca `flow_id` (só essa
 * coluna, até `STUCK_SAMPLE_LIMIT` linhas — não a `flow_runs` inteira, o erro
 * que `getAutomations` comete) para achar a automação mais afetada.
 */
export async function getStuckSummary(): Promise<StuckSummary> {
  const staleBefore = new Date(Date.now() - STALE_WAITING_REPLY_MS).toISOString()

  const [{ count: failed }, { count: stale }] = await Promise.all([
    supabaseAdmin
      .from('flow_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .or(NOT_DISMISSED),
    supabaseAdmin
      .from('flow_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'waiting_reply')
      .lt('updated_at', staleBefore),
  ])

  const total = (failed ?? 0) + (stale ?? 0)
  if (total === 0) {
    return { failed: failed ?? 0, staleWaitingReply: stale ?? 0, total: 0, topAutomation: null }
  }

  // Um `or` só, com o "não dispensado" aberto nos dois ramos de `failed` —
  // encadear um segundo `.or()` misturaria os dois grupos.
  const { data: stuckRows } = await supabaseAdmin
    .from('flow_runs')
    .select('flow_id')
    .or(
      `and(status.eq.failed,error.is.null),` +
        `and(status.eq.failed,error.not.ilike.${DISMISSED_ERROR_PREFIX}*),` +
        `and(status.eq.waiting_reply,updated_at.lt.${staleBefore})`,
    )
    .limit(STUCK_SAMPLE_LIMIT)

  const countByFlow = new Map<string, number>()
  for (const row of (stuckRows ?? []) as Array<{ flow_id: string }>) {
    countByFlow.set(row.flow_id, (countByFlow.get(row.flow_id) ?? 0) + 1)
  }

  const topFlowId = [...countByFlow.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  let topAutomation: StuckSummary['topAutomation'] = null

  if (topFlowId) {
    const [{ data: flow }, { data: trigger }] = await Promise.all([
      supabaseAdmin.from('flows').select('name').eq('id', topFlowId).maybeSingle(),
      supabaseAdmin
        .from('triggers')
        .select('id')
        .eq('flow_id', topFlowId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (flow && trigger) {
      topAutomation = {
        triggerId: (trigger as { id: string }).id,
        flowName: (flow as { name: string }).name,
        count: countByFlow.get(topFlowId) ?? 0,
      }
    }
  }

  return { failed: failed ?? 0, staleWaitingReply: stale ?? 0, total, topAutomation }
}

export interface FailedRun {
  id: string
  flowName: string
  /** Trigger da automação, para o card linkar direto — null se todos os triggers do fluxo sumiram. */
  triggerId: string | null
  contactUsername: string | null
  error: string | null
  updatedAt: string
}

/**
 * "Alguma automação falhou?" — `flow_runs.status = 'failed'` existe desde o
 * início e nunca apareceu na interface (ver CLAUDE.md/HANDOFF.md). Uma query
 * com join (limitada a `limit`) traz as falhas mais recentes; a segunda busca
 * só os triggers dos fluxos envolvidos (poucos, `in flow_id`) para linkar
 * direto na automação em vez de mandar o dono abrir cada uma na mão.
 *
 * Falha dispensada na mão (ver `src/lib/flow/dismissed.ts`) fica de fora: ela
 * continua `failed` no banco, mas já foi reconhecida e não deve manter o
 * painel vermelho para sempre.
 */
export async function getFailedAutomations(limit = 5): Promise<FailedRun[]> {
  const { data } = await supabaseAdmin
    .from('flow_runs')
    .select('id, error, updated_at, flow_id, flows(name), contacts(username)')
    .eq('status', 'failed')
    .or(NOT_DISMISSED)
    .order('updated_at', { ascending: false })
    .limit(limit)

  const rows = (data ?? []) as unknown as Array<{
    id: string
    error: string | null
    updated_at: string
    flow_id: string
    flows: { name: string } | null
    contacts: { username: string | null } | null
  }>
  if (rows.length === 0) return []

  const flowIds = [...new Set(rows.map((row) => row.flow_id))]
  const { data: triggers } = await supabaseAdmin
    .from('triggers')
    .select('id, flow_id')
    .in('flow_id', flowIds)

  const triggerByFlow = new Map<string, string>()
  for (const trigger of (triggers ?? []) as Array<{ id: string; flow_id: string }>) {
    if (!triggerByFlow.has(trigger.flow_id)) triggerByFlow.set(trigger.flow_id, trigger.id)
  }

  return rows.map((row) => ({
    id: row.id,
    flowName: row.flows?.name ?? 'fluxo removido',
    triggerId: triggerByFlow.get(row.flow_id) ?? null,
    contactUsername: row.contacts?.username ?? null,
    error: row.error,
    updatedAt: row.updated_at,
  }))
}

export interface CockpitData {
  leadsSeries: SeriesBucket[]
  sends: { points: SeriesBucket[]; cap: number }
  leadsTrend: DayTrend
  leadSources: LeadSource[]
  stuck: StuckSummary
  failedRuns: FailedRun[]
  inboxCounts: Record<InboxFilter, number>
  riskReport: RiskReport | null
}

/**
 * Junta as seis perguntas do cockpit numa chamada só, para a página só
 * compor. `getLeadSources`, `getInboxCounts` e `getRiskReport` já existiam —
 * reaproveitados aqui, não reescritos.
 */
export async function getCockpitData(): Promise<CockpitData> {
  const [leadsTrend, leadsSeries, sends, leadSources, stuck, failedRuns, inboxCounts, riskReport] =
    await Promise.all([
    getLeadsTrend(),
    getLeadsSeries(),
    getSendsSeries(),
    getLeadSources(),
    getStuckSummary(),
    getFailedAutomations(),
    getInboxCounts(),
    getRiskReport(),
  ])

  return { leadsTrend, leadsSeries, sends, leadSources, stuck, failedRuns, inboxCounts, riskReport }
}
