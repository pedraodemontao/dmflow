/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel PLANO
 * (material 36, "O plano: de curioso de IA a fechar contratos"), com o PDF anexado.
 * Slug curto, como a `28` a `35`: a página fica em dm.nocodepedro.site/e/36, e
 * a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-36.mts             simula
 *   ...scripts/criar-entrega-36.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m36 from '../../nocodepedro-site/app/entrega/entrega-36/content'

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
// Material 36 — O plano: de curioso de IA a fechar contratos
// ---------------------------------------------------------------------------
const entrega36: Entrega = {
  slug: '36',
  title: 'O plano: de curioso de IA a fechar contratos',
  subtitle:
    'Material complementar do post PLANO — os quatro hábitos que tiram você do modo curioso, os prompts de cada um e um plano de quatro semanas que termina com uma proposta enviada.',
  pdf: new URL('public/entrega/entrega-36.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Aqui está o plano completo que o vídeo prometeu: os quatro hábitos (dieta de informação, questionar a IA, trabalhar com referência e aprender com a própria IA), o prompt de cada um e as quatro semanas que levam de um projeto seu até a primeira proposta enviada.',
    ),
    c(`Comandos do Claude Code conferidos em ${m36.CHECKED_AT}, na versão 2.1.284.`),
    h('Antes de começar'),
    steps(m36.HOW_TO_READ),
    h('1. Onde você está hoje'),
    list(m36.STAGES.map((s) => `${s.name}: ${s.sign} Para subir: ${s.exit}`)),
    h('2. Hábito 1: dieta de informação'),
    steps(m36.DIET),
    p('O prompt do fim do dia:'),
    q(m36.DIET_PROMPT),
    h('3. Hábito 2: questione a IA'),
    steps(m36.QUESTION),
    p('Claude Code: instalar e planejar'),
    q(m36.PLAN_MODE),
    ...m36.QUESTION_PROMPTS.flatMap((v) => [p(`${v.title}:`), q(v.text)]),
    h('4. Hábito 3: trabalhe com referência'),
    steps(m36.REFERENCES),
    p('Construir a partir de referências:'),
    q(m36.REFERENCE_PROMPT),
    h('5. Hábito 4: aprenda com a própria IA'),
    steps(m36.LEARN),
    ...m36.LEARN_PROMPTS.flatMap((v) => [p(`${v.title}:`), q(v.text)]),
    h('6. O plano de 4 semanas'),
    ...m36.WEEKS.flatMap((w) => [p(`${w.name}. ${w.goal}`), check(w.tasks), c(`Pronto quando: ${w.done}`)]),
    h('7. Do projeto ao contrato'),
    steps(m36.SELL),
    p('A proposta da semana 4:'),
    q(m36.PROPOSAL_PROMPT),
    h('8. As armadilhas'),
    list(m36.TRAPS),
    h('9. Por onde começar hoje'),
    check(m36.NEXT),
    c('Começou a semana 1? Me manda no direct qual é o seu projeto.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega36]
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
