/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel OPEN
 * (material 35, "OpenCode: um modelo para cada tarefa"), com o PDF anexado.
 * Slug curto, como a `28` a `34`: a página fica em dm.nocodepedro.site/e/35, e
 * a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-35.mts             simula
 *   ...scripts/criar-entrega-35.mts --aplicar   grava, sobe o PDF e PUBLICA
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * O texto NÃO mora aqui: vem do `content.ts` do material no projeto do site
 * (~/projects/nocodepedro-site). Copiar o texto para cá faria a página do
 * painel e a do site divergirem na primeira correção. Corrigiu lá, rode de novo:
 * o script atualiza a entrega no lugar (idempotente pelo slug).
 *
 * Conta: `--conta=<username>`; sem isso, a única conta do banco. As entregas
 * aparecem no painel qualquer que seja a conta — a aba não filtra por ela.
 */
import { readFile } from 'node:fs/promises'

import { storedDeliverySchema, type DeliveryBlock } from '../src/lib/ai/schemas'
import { DELIVERY_FILES_BUCKET } from '../src/lib/delivery/file-url'
import { supabaseAdmin } from '../src/lib/supabase/admin'
import * as m35 from '../../nocodepedro-site/app/entrega/entrega-35/content'

const APLICAR = process.argv.includes('--aplicar')
const CONTA = process.argv.find((a) => a.startsWith('--conta='))?.slice('--conta='.length) || null
const SITE = new URL('../../nocodepedro-site/', import.meta.url)

interface Entrega {
  slug: string
  title: string
  subtitle: string
  pdf: URL
  /** O anexo entra logo depois deste índice: o PDF perto do topo, não no fim. */
  pdfAfter: number
  blocks: DeliveryBlock[]
}

const h = (text: string): DeliveryBlock => ({ type: 'heading', text })
const p = (text: string): DeliveryBlock => ({ type: 'paragraph', text })
const q = (text: string): DeliveryBlock => ({ type: 'quote', text })
const c = (text: string): DeliveryBlock => ({ type: 'callout', text })
const list = (items: string[]): DeliveryBlock => ({ type: 'list', items })
const check = (items: string[]): DeliveryBlock => ({ type: 'checklist', items })
const steps = (items: Array<{ title: string; text: string }>): DeliveryBlock => ({ type: 'steps', items })

// ---------------------------------------------------------------------------
// Material 35 — OpenCode: um modelo para cada tarefa
// ---------------------------------------------------------------------------
const entrega35: Entrega = {
  slug: '35',
  title: 'OpenCode: um modelo para cada tarefa',
  subtitle:
    'Material complementar do post OPEN — como instalar o OpenCode, conectar um modelo e pôr um modelo diferente em cada agente, com a conta de um teste medido.',
  pdf: new URL('public/entrega/entrega-35.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Aqui está o que o vídeo prometeu: o passo a passo para instalar o OpenCode, o arquivo que põe um modelo em cada agente e a conta de uma tarefa real, modelo por modelo. A mesma tarefa custou de US$ 0 a US$ 1,08.',
    ),
    c(
      `Conferido em ${m35.CHECKED_AT} no repositório oficial (${m35.TOOL.release}), na documentação e executando o programa num Mac, sem nenhuma chave conectada.`,
    ),
    h('Antes de começar'),
    list(m35.HOW_TO_READ.map((i) => `${i.title}. ${i.text}`)),
    h('1. O que você precisa'),
    steps(m35.REQUIREMENTS),
    h('2. Instalar'),
    q(m35.INSTALL),
    steps(m35.INSTALL_STEPS),
    h('3. Conectar um modelo'),
    list(m35.PROVIDERS.map((v) => `${v.name}: ${v.how} ${v.cost}`)),
    q(m35.CONNECT),
    steps(m35.CONNECT_STEPS),
    h('4. O primeiro uso'),
    q(m35.FIRST_RUN),
    list(m35.COMMANDS.map((k) => `${k.cmd}: ${k.what} Quando: ${k.when}`)),
    h('5. Um modelo para cada tarefa'),
    list(m35.AGENTS.map((a) => `${a.name} (${a.kind}): ${a.does} ${a.model}`)),
    p('opencode.json gratuito, o que rodamos no teste:'),
    q(m35.CONFIG_FREE),
    p('opencode.json com o OpenCode Go, US$ 10 por mês:'),
    q(m35.CONFIG_GO),
    p('opencode.json com Claude por API só no plano e modelo aberto no resto:'),
    q(m35.CONFIG_MIX),
    steps(m35.CONFIG_STEPS),
    p('O seu próprio agente, em .opencode/agents/revisor.md:'),
    q(m35.CUSTOM_AGENT),
    steps(m35.CUSTOM_AGENT_STEPS),
    h('6. Quanto custa cada modelo'),
    p(`Dólar por 1 milhão de tokens, conferido em ${m35.CHECKED_AT}. O último número é o teste da seção 7 naquele preço.`),
    list(
      m35.PRICES.map(
        (v) =>
          `${v.model} (${v.where}): entrada US$ ${v.input}, saída US$ ${v.output}, leitura de cache US$ ${v.cache}. O teste custaria ${v.test}.`,
      ),
    ),
    h('7. A conta: um teste medido'),
    p(m35.TEST.task),
    p(m35.TEST.setup),
    c(
      `${m35.TEST.total} tokens: ${m35.TEST.cache} de leitura de cache, ${m35.TEST.input} de entrada e ${m35.TEST.output} de saída. ${m35.TEST.time}, ${m35.TEST.messages}. Custo no teste: ${m35.TEST.cost}.`,
    ),
    steps(m35.TEST_FINDINGS),
    p(`Segundo teste. ${m35.SPLIT.task} Total: ${m35.SPLIT.total} tokens. Os mesmos tokens, em cinco combinações de modelo:`),
    list(m35.SCENARIOS.map((s) => `${s.cost}: ${s.name}. ${s.note}`)),
    p('O que este teste não prova:'),
    list(m35.TEST_LIMITS),
    h('8. Os prompts prontos'),
    ...m35.PROMPTS.flatMap((v) => [p(v.title), q(v.text)]),
    h('9. OpenCode e Claude Code juntos'),
    list(m35.WITH_CLAUDE_CODE),
    h('10. As armadilhas'),
    list(m35.TRAPS),
    h('11. O que esperar de verdade'),
    list(m35.REALITY),
    h('12. Por onde começar hoje'),
    check(m35.NEXT),
    c('Instalou? Me manda no direct qual modelo você colocou no build.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega35]
for (const e of ENTREGAS) {
  const parsed = storedDeliverySchema.safeParse({ title: e.title, subtitle: e.subtitle, blocks: e.blocks })
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    throw new Error(`entrega ${e.slug} recusada pelo schema: ${i?.path.join('.')}: ${i?.message}`)
  }
  await readFile(e.pdf) // PDF faltando para aqui, não depois de a entrega estar publicada sem anexo.
}

const { data: contas } = await supabaseAdmin.from('accounts').select('id, username')
const todas = (contas ?? []) as { id: string; username: string }[]
const conta = CONTA ? todas.find((a) => a.username === CONTA) : todas.length === 1 ? todas[0] : undefined
if (!conta) {
  console.error(
    CONTA
      ? `@${CONTA} não está no banco (contas: ${todas.map((a) => `@${a.username}`).join(', ') || 'nenhuma'}).`
      : `Há ${todas.length} contas no banco: passe --conta=<username>.`,
  )
  process.exit(1)
}

const { data: bucket } = await supabaseAdmin.storage.getBucket(DELIVERY_FILES_BUCKET)
console.log(`conta @${conta.username}${APLICAR ? '' : '   (SIMULAÇÃO — nada será gravado)'}`)
console.log(`bucket ${DELIVERY_FILES_BUCKET}: ${bucket ? 'ok' : 'NÃO EXISTE — a entrega sai sem o PDF'}\n`)

for (const e of ENTREGAS) {
  const { data: existente } = await supabaseAdmin
    .from('deliveries')
    .select('id, status')
    .eq('slug', e.slug)
    .maybeSingle()
  const atual = existente as { id: string; status: string } | null

  const pdf = await readFile(e.pdf)
  console.log(`ENTREGA /e/${e.slug}  ${atual ? `atualizar (${atual.status})` : 'criar'} → published`)
  console.log(`  "${e.title}"`)
  console.log(`  ${e.blocks.length} blocos + PDF (${Math.round(pdf.byteLength / 1024)} KB)`)
  if (!APLICAR) continue

  let id = atual?.id ?? null
  if (!id) {
    const { data, error } = await supabaseAdmin
      .from('deliveries')
      .insert({ account_id: conta.id, slug: e.slug, title: e.title, subtitle: e.subtitle, blocks: e.blocks })
      .select('id')
      .single()
    if (error) throw new Error(`entrega ${e.slug} não gravada: ${error.message}`)
    id = (data as { id: string }).id
  }

  // Caminho derivado do id, como em `uploadDeliveryFile`: nada de nome cru no bucket.
  let blocks = e.blocks
  if (bucket) {
    const path = `${id}/material-${e.slug}.pdf`
    const { error } = await supabaseAdmin.storage
      .from(DELIVERY_FILES_BUCKET)
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    if (error) throw new Error(`PDF ${e.slug} não subiu: ${error.message}`)
    const anexo: DeliveryBlock = {
      type: 'file',
      path,
      label: `Material ${e.slug} completo em PDF`,
      sizeBytes: pdf.byteLength,
    }
    blocks = [...e.blocks.slice(0, e.pdfAfter + 1), anexo, ...e.blocks.slice(e.pdfAfter + 1)]
  }

  const agora = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('deliveries')
    .update({
      title: e.title,
      subtitle: e.subtitle,
      blocks,
      status: 'published',
      // Republicar não reescreve a data da primeira publicação.
      ...(atual?.status === 'published' ? {} : { published_at: agora }),
      updated_at: agora,
    })
    .eq('id', id)
  if (error) throw new Error(`entrega ${e.slug} não publicada: ${error.message}`)
  console.log(`  ✓ publicada (${id})`)
}

console.log(
  APLICAR
    ? '\nPronto. Aparece em Biblioteca → Entregas e pode ser escolhida na automação ({{presente}}).'
    : '\nSimulação. Rode de novo com --aplicar para gravar e publicar.',
)
