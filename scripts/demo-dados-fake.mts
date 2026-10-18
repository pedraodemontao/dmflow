/**
 * Enche o painel de dados FAKE para gravar vídeo — e tira tudo depois.
 *
 *   ...scripts/demo-dados-fake.mts             simula (só conta o que gravaria)
 *   ...scripts/demo-dados-fake.mts --aplicar   limpa o fake anterior e grava de novo
 *   ...scripts/demo-dados-fake.mts --limpar    apaga todo o fake e mais nada
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * NÃO EXISTE STAGING: isto escreve no banco de produção, ao lado dos dados
 * reais. Por isso tudo nasce marcado e nada pode disparar envio:
 *
 * - contato fake tem `ig_user_id` começando com `demo_`. Runs, mensagens,
 *   eventos de nó e cliques penduram nele com `on delete cascade` — apagar o
 *   contato apaga o rastro inteiro.
 * - gatilho fake é preso a um post que não existe (`media_id` = `demo_...`).
 *   O matcher só deixa gatilho com `media_id` valer naquele post, então ele
 *   aparece ATIVO no painel e nunca casa com comentário de verdade.
 * - run fake nunca fica `sleeping` (o tick retomaria e tentaria mandar DM) nem
 *   `failed`. Só `done` ou `waiting_reply`, que só anda se o contato escrever —
 *   e contato `demo_` não escreve.
 * - `send_log` fake leva `media_id = 'demo_send'` e fica fora da última hora:
 *   o cap de envios/hora lê essa tabela, e linha fake recente seguraria a
 *   automação real.
 * - nada vai para `webhook_events`.
 */
import { flowDefinitionSchema, type FlowDefinition } from '../src/lib/flow/types'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const DEMO = 'demo_'
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const NOW = Date.now()

const mode = process.argv.includes('--limpar')
  ? 'limpar'
  : process.argv.includes('--aplicar')
    ? 'aplicar'
    : 'simular'

let seed = 20261004
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
const chance = (p: number) => rand() < p
const iso = (ms: number) => new Date(ms).toISOString()

async function must<T>(label: string, query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function insertChunked(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    await must(table, supabaseAdmin.from(table).insert(rows.slice(i, i + 500)))
  }
}

async function cleanup() {
  const triggers = await must(
    'triggers',
    supabaseAdmin.from('triggers').select('id, flow_id').like('media_id', `${DEMO}%`),
  )
  const flowIds = [...new Set((triggers ?? []).map((t) => t.flow_id as string))]

  const { count: contacts } = await supabaseAdmin
    .from('contacts')
    .delete({ count: 'exact' })
    .like('ig_user_id', `${DEMO}%`)
  const { count: sends } = await supabaseAdmin
    .from('send_log')
    .delete({ count: 'exact' })
    .eq('media_id', 'demo_send')
  if (flowIds.length > 0) {
    await must('flows', supabaseAdmin.from('flows').delete().in('id', flowIds))
  }

  console.log(
    `limpeza: ${contacts ?? 0} contatos (com runs, mensagens e cliques), ` +
      `${flowIds.length} automações, ${sends ?? 0} linhas de send_log`,
  )
}

const accountRow = await must(
  'accounts',
  supabaseAdmin
    .from('accounts')
    .select('id, username')
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .single(),
)
if (!accountRow) throw new Error("nenhuma conta ativa")
const account = accountRow

if (mode === 'limpar') {
  await cleanup()
  process.exit(0)
}

// --- automações: definição clonada dos fluxos reais, nome e palavra novos ---

const realFlows = await must('flows', supabaseAdmin.from('flows').select('name, definition'))
const defByName = new Map((realFlows ?? []).map((f) => [f.name as string, f.definition as FlowDefinition]))

function realDef(name: string): FlowDefinition {
  const def = defByName.get(name)
  if (!def) throw new Error(`fluxo real "${name}" não encontrado para clonar`)
  return flowDefinitionSchema.parse(def)
}

const PUBLIC_REPLY =
  '{Te mandei no direct 📩|Chegou aqui! Olha seu privado 👀|Já tá no seu direct, confere lá 🚀|Mandei agora no privado!}'

const AUTOMATIONS = [
  { name: 'Comentário AGENTES → guia de agentes', keyword: 'agentes', from: 'Comentário → Claude Code', weight: 34, active: true },
  { name: 'Comentário VIBE → mapa do vibe coding', keyword: 'vibe', from: 'Comentário → Vibe Coding', weight: 26, active: true },
  { name: 'Comentário CODEX → comparativo Codex × Claude', keyword: 'codex', from: 'Comentário → Codex vs Claude Code', weight: 16, active: true },
  { name: 'Comentário PROMPT → 40 prompts prontos', keyword: 'prompt', from: 'Comentário → checklist', weight: 12, active: true },
  { name: 'Comentário DESIGN → biblioteca de design', keyword: 'design', from: 'Comentário CHINA → material 27', weight: 8, active: true },
  { name: 'Comentário MCP → kit de MCPs', keyword: 'mcp', from: 'Presente com follow', weight: 4, active: false },
] as const

// --- pessoas ---

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Lucas', 'Mariana', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Renata', 'Rodrigo', 'Sofia', 'Thiago', 'Vanessa', 'Vinícius', 'Yasmin', 'Gustavo', 'Beatriz', 'Leonardo', 'Camila', 'André', 'Júlia', 'Caio', 'Letícia', 'Murilo', 'Fernanda', 'Pedro', 'Aline', 'Daniel', 'Priscila', 'Igor']
const LAST = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Ferreira', 'Costa', 'Rocha', 'Almeida', 'Carvalho', 'Ribeiro', 'Martins', 'Barbosa', 'Gomes', 'Araújo', 'Mendes', 'Moreira', 'Teixeira', 'Freitas', 'Nunes']
const BIO = ['', '', '', ' | Dev', ' | Marketing digital', ' | IA aplicada', ' | Designer', ' | Social media', ' | Empreendedora', ' | No-code', ' | Tech', ' | Produtor de conteúdo']
const TAGS = ['lead', 'lead', 'quente', 'comprou', 'aluno', 'parceria']

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Posts reais da conta: só servem de `source_id` do contato, para o card de
// "de onde vêm os leads" mostrar capa. Não é gatilho — contato não dispara nada.
const REAL_MEDIA = ['18618622117034382', '18198038236335725', '18109404692003644', '18360367345210831']

const TOTAL_CONTACTS = 186

/** Mais gente nos dias recentes: o gráfico sobe em vez de ficar chapado. */
function entryTime(): number {
  const daysAgo = 30 * Math.pow(rand(), 1.8)
  let t = NOW - daysAgo * DAY
  const hour = new Date(t).getHours()
  if (hour >= 1 && hour < 8) t += 10 * HOUR * rand()
  return Math.min(t, NOW - 20 * 60 * 1000)
}

// --- caminhar pelo fluxo: decide até onde cada pessoa foi ---

type Step = { nodeId: string; type: string; click?: { payload: string; title: string } }

function walk(def: FlowDefinition): { steps: Step[]; finished: boolean } {
  const steps: Step[] = []
  let current: string | null | undefined = def.entry
  for (let guard = 0; current && guard < 30; guard++) {
    const node: FlowDefinition["nodes"][string] | undefined = def.nodes[current]
    if (!node) break
    const step: Step = { nodeId: current, type: node.type }
    steps.push(step)
    if (node.type === 'end') return { steps, finished: true }

    let next: string | null | undefined = null
    if (node.type === 'condition') {
      next = chance(0.75) ? node.cases[0].next : (node.fallback ?? node.cases[0].next)
    } else if (node.type === 'randomize') {
      next = pick(node.paths).next
    } else if ('next' in node) {
      next = node.next
    }

    if (node.type === 'buttons') {
      const postback = node.buttons.filter((b) => 'payload' in b && b.payload)
      if (postback.length > 0) {
        if (!chance(0.82)) return { steps, finished: false }
        const b = postback[0] as { payload: string; title: string }
        step.click = { payload: b.payload, title: b.title }
      } else if (!chance(0.9)) {
        return { steps, finished: false }
      }
    } else if (node.type === 'wait_reply' || node.type === 'delay' || node.type === 'ask') {
      if (!chance(0.85)) return { steps, finished: false }
    }
    current = next
  }
  return { steps, finished: !current }
}

const INBOUND = ['quero!', 'Quero sim 🙏', 'manda aí', 'Oi! quero o material', 'valeu demais!!', 'Muito obrigado, conteúdo top 🔥', 'consegui baixar, obrigada!', 'tem aula sobre isso?', 'isso funciona no Windows?', 'show, vou testar hoje', 'Qual ferramenta você usou no vídeo?', 'Me salvou kkkk', 'tem versão em vídeo?', 'vc tem mentoria?']
const OUTBOUND_MANUAL = ['Boa! Qualquer dúvida me chama aqui 🙌', 'Funciona sim! Só seguir o passo 2 do material.', 'Tem sim, sai essa semana no perfil 👀', 'Que bom que ajudou! Me conta o resultado depois.', 'Usei o Claude Code com o plugin que tá no material.']

function spinFirst(text: string): string {
  return text.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, g: string) => pick(g.split('|')))
}

function nodeText(def: FlowDefinition, nodeId: string, nome: string): string | null {
  const node = def.nodes[nodeId] as { text?: string; bubbles?: Array<{ text: string }> }
  const raw = node.text ?? node.bubbles?.[0]?.text
  return raw ? spinFirst(raw.replaceAll('{{nome}}', nome)) : null
}

// --- montar tudo em memória ---

const flows: Record<string, unknown>[] = []
const triggers: Record<string, unknown>[] = []
const plan = AUTOMATIONS.map((a, i) => {
  const flowId = crypto.randomUUID()
  const def = realDef(a.from)
  flows.push({
    id: flowId,
    account_id: account.id,
    name: a.name,
    definition: def,
    is_active: a.active,
    created_at: iso(NOW - (32 - i * 3) * DAY),
    updated_at: iso(NOW - (5 - Math.min(i, 4)) * DAY),
  })
  triggers.push({
    account_id: account.id,
    flow_id: flowId,
    type: 'comment',
    keywords: [a.keyword],
    match_mode: 'contains',
    media_id: `${DEMO}post_${a.keyword}`,
    public_reply: PUBLIC_REPLY,
    priority: 0,
    is_active: a.active,
    created_at: iso(NOW - (32 - i * 3) * DAY),
  })
  return { ...a, flowId, def }
})
const weightTotal = plan.reduce((s, a) => s + a.weight, 0)
function pickAutomation() {
  let r = rand() * weightTotal
  for (const a of plan) if ((r -= a.weight) < 0) return a
  return plan[0]
}

const contacts: Record<string, unknown>[] = []
const runs: Record<string, unknown>[] = []
const events: Record<string, unknown>[] = []
const clicks: Record<string, unknown>[] = []
const messages: Record<string, unknown>[] = []
const sends: Record<string, unknown>[] = []
const usedHandles = new Set<string>()

for (let i = 0; i < TOTAL_CONTACTS; i++) {
  const first = pick(FIRST)
  const last = pick(LAST)
  let handle = ''
  do {
    handle = pick([
      `${strip(first)}.${strip(last)}`,
      `${strip(first)}${strip(last)}`,
      `${strip(first)}_${pick(['ia', 'dev', 'tech', 'mkt', 'design', 'nocode'])}`,
      `${strip(first)}${Math.floor(rand() * 99)}`,
    ])
  } while (usedHandles.has(handle))
  usedHandles.add(handle)

  const contactId = crypto.randomUUID()
  const auto = pickAutomation()
  const start = entryTime()
  const { steps, finished } = walk(auto.def)
  const engaged = steps.some((s) => s.click) || chance(0.25)

  let t = start
  const thread: Array<{ dir: 'in' | 'out'; text: string; at: number; source: 'flow' | 'manual' }> = []
  thread.push({ dir: 'in', text: auto.keyword.toUpperCase(), at: t - 30_000, source: 'flow' })
  const runId = crypto.randomUUID()
  let lastInbound: number | null = null

  for (const step of steps) {
    events.push({ flow_id: auto.flowId, run_id: runId, contact_id: contactId, node_id: step.nodeId, node_type: step.type, created_at: iso(t) })
    const text = nodeText(auto.def, step.nodeId, first)
    if (text) {
      thread.push({ dir: 'out', text, at: t, source: 'flow' })
      sends.push({ account_id: account.id, kind: thread.length <= 2 ? 'private_reply' : 'dm', media_id: 'demo_send', created_at: iso(t) })
    }
    if (step.click) {
      t += (20 + rand() * 600) * 1000
      clicks.push({ account_id: account.id, contact_id: contactId, flow_id: auto.flowId, node_id: step.nodeId, payload: step.click.payload, title: step.click.title, created_at: iso(t) })
      thread.push({ dir: 'in', text: step.click.title, at: t, source: 'flow' })
      lastInbound = t
    }
    const node = auto.def.nodes[step.nodeId] as { type: string; seconds?: number }
    t += node.type === 'delay' ? (node.seconds ?? 300) * 1000 : (2 + rand() * 8) * 1000
    if (t > NOW - 5 * 60 * 1000) break
  }
  sends.push({ account_id: account.id, kind: 'public_reply', media_id: 'demo_send', created_at: iso(start + 25_000) })

  if (engaged && chance(0.55)) {
    t = Math.min(t + (5 + rand() * 180) * 60 * 1000, NOW - 2 * 60 * 1000)
    thread.push({ dir: 'in', text: pick(INBOUND), at: t, source: 'flow' })
    lastInbound = t
    if (chance(0.6)) {
      t = Math.min(t + (3 + rand() * 90) * 60 * 1000, NOW - 60 * 1000)
      thread.push({ dir: 'out', text: pick(OUTBOUND_MANUAL), at: t, source: 'manual' })
    }
  }

  const ended = Math.min(t, NOW - 60 * 1000)
  const stoppedRecently = !finished && NOW - ended < 12 * HOUR
  runs.push({
    id: runId,
    account_id: account.id,
    flow_id: auto.flowId,
    contact_id: contactId,
    current_node: steps.at(-1)?.nodeId ?? null,
    status: stoppedRecently ? 'waiting_reply' : 'done',
    context: { vars: {}, lastInput: auto.keyword },
    created_at: iso(start),
    updated_at: iso(ended),
  })

  const lastMessage = thread.at(-1)!
  const isUnread = lastMessage.dir === 'in' && NOW - lastMessage.at < 2 * DAY && chance(0.7)
  contacts.push({
    id: contactId,
    account_id: account.id,
    ig_user_id: `${DEMO}${handle}`,
    username: handle,
    name: `${first} ${last}${pick(BIO)}`,
    tags: finished ? [...new Set(['lead', ...(chance(0.25) ? [pick(TAGS)] : [])])] : chance(0.5) ? ['lead'] : [],
    fields: {},
    last_inbound_at: lastInbound ? iso(lastInbound) : null,
    subscribed: true,
    automation_paused: false,
    last_message_at: iso(lastMessage.at),
    unread_count: isUnread ? 1 + Math.floor(rand() * 2) : 0,
    source_type: 'comment',
    source_id: pick(REAL_MEDIA),
    source_at: iso(start - 30_000),
    inbox_status: NOW - lastMessage.at > 5 * DAY && chance(0.6) ? 'done' : 'open',
    profile_pic_url: chance(0.85) ? `https://i.pravatar.cc/150?u=${handle}` : null,
    follower_count: Math.floor(Math.pow(rand(), 3) * 40000) + 80,
    is_verified: chance(0.03),
    profile_synced_at: iso(NOW - rand() * DAY),
    follows_account: chance(0.7),
    follows_checked_at: iso(NOW - rand() * DAY),
    created_at: iso(start - 30_000),
    updated_at: iso(lastMessage.at),
  })

  for (const m of thread) {
    messages.push({
      account_id: account.id,
      contact_id: contactId,
      direction: m.dir,
      text: m.text,
      payload: {},
      source: m.source,
      created_at: iso(m.at),
    })
  }
}

// O cap de envios/hora lê send_log: nada fake na última hora.
const safeSends = sends.filter((s) => NOW - new Date(s.created_at as string).getTime() > 65 * 60 * 1000)

console.log(`conta: @${account.username}`)
console.log(
  `automações ${flows.length} · contatos ${contacts.length} · runs ${runs.length} · ` +
    `eventos de nó ${events.length} · cliques ${clicks.length} · mensagens ${messages.length} · ` +
    `send_log ${safeSends.length}`,
)

if (mode === 'simular') {
  console.log('\nsimulação — nada gravado. Rode com --aplicar para gravar.')
  process.exit(0)
}

await cleanup()
await insertChunked('flows', flows)
await insertChunked('triggers', triggers)
await insertChunked('contacts', contacts)
await insertChunked('flow_runs', runs)
await insertChunked('flow_node_events', events)
await insertChunked('button_clicks', clicks)
await insertChunked('messages', messages)
await insertChunked('send_log', safeSends)
console.log('\ngravado. Para tirar tudo: --limpar')
