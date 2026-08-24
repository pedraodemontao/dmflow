/**
 * Auditoria de prontidão: o que dispara, o que entrega, e onde o funil vaza.
 *
 *   npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/auditoria.mts
 *
 * Só leitura: nenhuma DM, nenhuma escrita, nenhuma chamada paga. Existe porque
 * `pronto-para-usar.mts` responde "a operação está de pé" e esta responde a
 * pergunta seguinte: "o que ela entrega chega inteiro?". Link quebrado em DM é
 * sucesso do ponto de vista do sistema — a mensagem saiu.
 */
import { supabaseAdmin } from '../src/lib/supabase/admin'
import { flowDefinitionSchema, type FlowDefinition } from '../src/lib/flow/types'
import { findLeaks } from '../src/lib/flow/leaks'
import { variantCount } from '../src/lib/flow/variation'

const problemas: string[] = []
const avisos: string[] = []

function falha(msg: string) {
  problemas.push(msg)
  console.log(`  ✖ ${msg}`)
}
function aviso(msg: string) {
  avisos.push(msg)
  console.log(`  ⚠ ${msg}`)
}
function ok(msg: string) {
  console.log(`  ✓ ${msg}`)
}

const { data: contas } = await supabaseAdmin
  .from('accounts')
  .select('id, username, is_active, automations_paused, token_expires_at, comments_cursor, messages_cursor')

for (const conta of (contas ?? []) as Array<Record<string, never> & {
  id: string
  username: string
  is_active: boolean
  automations_paused: boolean
  token_expires_at: string
  comments_cursor: string | null
  messages_cursor: string | null
}>) {
  const [{ data: fluxos }, { data: gatilhos }, { data: entregas }] = await Promise.all([
    supabaseAdmin
      .from('flows')
      .select('id, name, is_active, definition, delivery_id')
      .eq('account_id', conta.id),
    supabaseAdmin
      .from('triggers')
      .select('id, type, keywords, match_mode, media_id, public_reply, is_active, priority, flow_id')
      .eq('account_id', conta.id),
    supabaseAdmin
      .from('deliveries')
      .select('id, slug, title, status, cta_url, blocks')
      .eq('account_id', conta.id),
  ])

  const porFluxo = new Map((fluxos ?? []).map((f) => [f.id as string, f]))
  const porEntrega = new Map((entregas ?? []).map((d) => [d.id as string, d]))

  // ---- gatilhos -----------------------------------------------------------
  console.log(`\n=== GATILHOS de @${conta.username} ===`)
  for (const g of (gatilhos ?? []) as Array<{
    id: string
    type: string
    keywords: string[] | null
    match_mode: string
    media_id: string | null
    public_reply: string | null
    is_active: boolean
    priority: number
    flow_id: string
  }>) {
    const fluxo = porFluxo.get(g.flow_id) as { name: string; is_active: boolean } | undefined
    const palavras = (g.keywords ?? []).join(', ') || '(sem palavra)'
    console.log(
      `\n[${g.is_active ? 'ATIVO' : 'off'}] ${g.type}: ${palavras} → fluxo "${fluxo?.name ?? '???'}"`,
    )
    if (!g.is_active) continue

    if (!fluxo) falha(`gatilho aponta para fluxo inexistente (${g.flow_id})`)
    else if (!fluxo.is_active) falha(`gatilho ATIVO aponta para fluxo DESLIGADO "${fluxo.name}"`)

    if (g.type === 'comment' && g.media_id) {
      falha(`preso ao post ${g.media_id} — em post novo é silêncio total, sem erro e sem log`)
    } else if (g.type === 'comment') {
      ok('vale para qualquer post')
    }

    if ((g.keywords ?? []).length === 0 && g.type !== 'default') {
      aviso('gatilho sem palavra-chave')
    }

    if (g.type === 'comment') {
      if (!g.public_reply) {
        aviso('sem resposta pública — o comentário fica sem resposta visível')
      } else {
        const n = variantCount(g.public_reply)
        if (n < 3) falha(`resposta pública com ${n} variante(s); o mínimo para ativar é 3`)
        else ok(`resposta pública com ${n} variantes`)
      }
    }
  }

  // ---- fluxos -------------------------------------------------------------
  console.log(`\n=== FLUXOS de @${conta.username} ===`)
  // Só o que está no ar vira problema: link quebrado dentro de fluxo desligado
  // não perde lead nenhum, e tratá-lo como falha ensina o dono a ignorar a
  // auditoria inteira — que é o jeito mais rápido de perder o próximo de verdade.
  const urls = new Map<string, { onde: string[]; ativo: boolean }>()

  for (const f of (fluxos ?? []) as Array<{
    id: string
    name: string
    is_active: boolean
    definition: unknown
    delivery_id: string | null
  }>) {
    console.log(`\n[${f.is_active ? 'ATIVO' : 'off'}] ${f.name}`)

    const parsed = flowDefinitionSchema.safeParse(f.definition)
    if (!parsed.success) {
      falha(
        `definição inválida: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ')}`,
      )
      continue
    }
    const def: FlowDefinition = parsed.data
    const nos = Object.entries(def.nodes)
    ok(`${nos.length} blocos, entrada em "${def.entry}"`)

    const vazamentos = findLeaks(def, { hasDelivery: Boolean(f.delivery_id) })
    for (const v of vazamentos) {
      const linha = `${v.nodeId}: ${v.message}`
      if (v.level === 'erro') falha(linha)
      else aviso(linha)
    }

    for (const [id, node] of nos) {
      const texto = (node as { text?: string }).text
      if (texto) {
        const n = variantCount(texto)
        if (f.is_active && n < 2) falha(`bloco "${id}" com ${n} variante(s) de spintax (mínimo 2)`)
      }
      const bruto = JSON.stringify(node)
      for (const m of bruto.matchAll(/https?:\/\/[^"'\s\\]+/g)) {
        const url = m[0].replace(/[.,)]+$/, '')
        const antes = urls.get(url)
        urls.set(url, {
          onde: [...(antes?.onde ?? []), `${f.name} / ${id}`],
          ativo: (antes?.ativo ?? false) || f.is_active,
        })
      }
    }

    if (f.delivery_id) {
      const d = porEntrega.get(f.delivery_id) as { slug: string; status: string } | undefined
      if (!d) falha('delivery_id aponta para entrega inexistente')
      else if (d.status !== 'published')
        falha(`entrega vinculada "${d.slug}" está em RASCUNHO — a página pública devolve 404`)
      else ok(`entrega publicada: /e/${d.slug}`)
    } else if (f.is_active) {
      aviso('fluxo ativo sem entrega vinculada')
    }
  }

  // ---- links --------------------------------------------------------------
  console.log(`\n=== LINKS citados nos fluxos ===`)
  if (urls.size === 0) console.log('  (nenhum)')
  for (const [url, { onde, ativo }] of urls) {
    const rotulo = `${url}  [${onde.join(', ')}]${ativo ? '' : ' (fluxo desligado)'}`
    const ruim = ativo ? falha : aviso
    try {
      const r = await fetch(url, { redirect: 'follow' })
      if (r.ok) ok(`${r.status} ${rotulo}`)
      else ruim(`${r.status} ${rotulo}`)
    } catch (e) {
      ruim(`inacessível ${rotulo} (${(e as Error).message})`)
    }
  }

  // ---- entregas -----------------------------------------------------------
  console.log(`\n=== ENTREGAS (materiais) ===`)
  const usadas = new Set((fluxos ?? []).map((f) => f.delivery_id as string | null).filter(Boolean))
  if ((entregas ?? []).length === 0) console.log('  (nenhuma)')
  for (const d of (entregas ?? []) as Array<{
    id: string
    slug: string
    title: string
    status: string
    cta_url: string | null
    blocks: unknown[]
  }>) {
    const marca = d.status === 'published' ? '●' : '○'
    const vinculada = usadas.has(d.id) ? 'ligada a um fluxo' : 'SEM fluxo'
    console.log(`  ${marca} ${d.status.padEnd(9)} ${d.slug} — ${d.title} (${vinculada})`)
    if (d.status === 'published' && !usadas.has(d.id))
      aviso(`entrega publicada "${d.slug}" não é mandada por nenhum fluxo`)
    if (d.status !== 'published' && usadas.has(d.id))
      falha(`entrega "${d.slug}" está em rascunho mas um fluxo aponta para ela`)
    if ((d.blocks ?? []).length === 0) aviso(`entrega "${d.slug}" está sem blocos de conteúdo`)
  }


  // ---- quem entregou cada evento ------------------------------------------
  //
  // Os dois caminhos gravam o MESMO `dedup_key` (`msg:{mid}` / `comment:{id}`),
  // então a chave não diz nada. O que separa é a forma do `value`: o polling
  // monta o objeto à mão (`poll.ts`, `toCommentEvent` e o laço de mensagens) e
  // só põe ali o que vai usar — `{sender, message}` para DM, `{id, text, from,
  // media:{id}}` para comentário. A Meta manda o objeto inteiro, com
  // `recipient` e `timestamp` na DM e `media_product_type` no comentário.
  // Campo que o polling não tem como inventar é prova de que veio pelo webhook.
  console.log(`\n=== QUEM ENTREGOU OS EVENTOS (histórico inteiro) ===`)
  const { data: todos } = await supabaseAdmin
    .from('webhook_events')
    .select('payload, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  const origem = { webhook: 0, varredura: 0, indeterminado: 0 }
  let ultimoWebhook: string | null = null
  for (const e of (todos ?? []) as Array<Record<string, any>>) {
    const v = e.payload?.value ?? {}
    const kind = e.payload?.kind
    let quem: keyof typeof origem
    if (kind === 'messaging') {
      quem = v.recipient || v.timestamp ? 'webhook' : 'varredura'
    } else if (kind === 'comment') {
      quem = v.media?.media_product_type || v.timestamp ? 'webhook' : 'varredura'
    } else {
      quem = 'indeterminado'
    }
    origem[quem]++
    if (quem === 'webhook' && !ultimoWebhook) ultimoWebhook = String(e.created_at)
  }

  console.log(`  pela varredura (polling) . ${origem.varredura}`)
  console.log(`  pelo webhook ............. ${origem.webhook}`)
  if (origem.indeterminado) console.log(`  indeterminado ............ ${origem.indeterminado}`)
  if (origem.webhook === 0 && origem.varredura > 0) {
    aviso(
      'nenhum evento chegou pelo webhook — a entrega está saindo 100% pela varredura, ' +
        'o que funciona mas custa até um tick de atraso. Confira a assinatura no nível do APP (README).',
    )
  } else if (ultimoWebhook) {
    ok(`último evento pelo webhook: ${ultimoWebhook.slice(0, 16)}`)
  }

  // ---- fila e saúde recente ----------------------------------------------
  console.log(`\n=== FILA E SAÚDE (últimas 24h) ===`)
  const desde = new Date(Date.now() - 86_400_000).toISOString()

  const [eventos, publicas, runsFalhos, envios, runsAtivos] = await Promise.all([
    supabaseAdmin
      .from('webhook_events')
      .select('status', { count: 'exact', head: false })
      .gte('created_at', desde),
    supabaseAdmin.from('pending_public_replies').select('status').gte('created_at', desde),
    supabaseAdmin
      .from('flow_runs')
      .select('id, error, updated_at, flow_id')
      .eq('status', 'failed')
      .gte('updated_at', desde),
    supabaseAdmin.from('send_log').select('id').gte('created_at', desde),
    supabaseAdmin
      .from('flow_runs')
      .select('status')
      .in('status', ['running', 'waiting_reply', 'sleeping']),
  ])

  const conta1 = (rows: { status?: string }[] | null) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.status ?? '?', (m.get(r.status ?? '?') ?? 0) + 1)
    return [...m].map(([k, v]) => `${k}=${v}`).join(' ') || 'vazio'
  }

  console.log(`  webhook_events ........... ${conta1(eventos.data as { status: string }[])}`)
  console.log(`  respostas públicas ....... ${conta1(publicas.data as { status: string }[])}`)
  console.log(`  runs em andamento ........ ${conta1(runsAtivos.data as { status: string }[])}`)
  console.log(`  envios em 24h ............ ${(envios.data ?? []).length}`)

  const falhos = (runsFalhos.data ?? []) as Array<{ error: string | null; flow_id: string }>
  if (falhos.length) {
    falha(`${falhos.length} flow_run(s) falharam em 24h`)
    for (const r of falhos.slice(0, 10)) {
      const nome = (porFluxo.get(r.flow_id) as { name?: string } | undefined)?.name ?? r.flow_id
      console.log(`      ${nome}: ${r.error}`)
    }
  } else ok('nenhum flow_run falhou em 24h')

  const presos = (eventos.data ?? []).filter(
    (e) => (e as { status: string }).status === 'pending',
  ).length
  if (presos > 20) falha(`${presos} eventos pendentes na fila — o tick não está drenando`)
}

console.log(`\n${'='.repeat(60)}`)
console.log(`PROBLEMAS: ${problemas.length}   AVISOS: ${avisos.length}`)
for (const p of problemas) console.log(`  ✖ ${p}`)
for (const a of avisos) console.log(`  ⚠ ${a}`)
