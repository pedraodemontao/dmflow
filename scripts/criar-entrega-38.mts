/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel VIBE
 * (material 38, "O mapa do vibe coding: construir e vender sistemas"), com o
 * PDF anexado. Slug curto, como a `28` a `37`: a página fica em
 * dm.nocodepedro.site/e/38, e a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-38.mts             simula
 *   ...scripts/criar-entrega-38.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m38 from '../../nocodepedro-site/app/entrega/entrega-38/content'

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
// Material 38 — O mapa do vibe coding: construir e vender sistemas
// ---------------------------------------------------------------------------
const entrega38: Entrega = {
  slug: '38',
  title: 'O mapa do vibe coding: construir e vender sistemas',
  subtitle:
    'Material complementar do post VIBE — os quatro sistemas que vendem, a lista de segurança, o preço com setup e mensal, a função nova que vira orçamento e a captação por conteúdo a R$ 0.',
  pdf: new URL('public/entrega/entrega-38.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Aqui está o mapa que o vídeo prometeu: o que construir, para quem, como deixar seguro, quanto cobrar, como virar recorrência e como o próximo cliente te acha. Com os prompts de escopo, auditoria, preço e lista de funções prontos para colar.',
    ),
    c(`Preços de hospedagem conferidos em ${m38.CHECKED_AT}.`),
    h('Antes de começar'),
    steps(m38.HOW_TO_READ),
    h('1. O que vender: os quatro sistemas'),
    list(m38.PRODUCTS.map((x) => `${x.name} (${x.price}). Para quem: ${x.who} Versão 1: ${x.mvp} ${x.note}`)),
    p('O prompt de escopo:'),
    q(m38.SCOPE_PROMPT),
    h('2. Integrações e segurança'),
    p('As integrações que a versão 1 pede:'),
    steps(m38.INTEGRATIONS),
    p('A lista de segurança:'),
    steps(m38.SECURITY),
    p('O prompt de auditoria, antes de entregar:'),
    q(m38.SECURITY_PROMPT),
    h('3. Ticket alto: como chegar nos 3, 5 e 10 mil'),
    steps(m38.PRICING),
    p('O prompt de preço:'),
    q(m38.PRICE_PROMPT),
    h('4. Recorrência: mês 1, mês 2, mês 3'),
    steps(m38.RECURRING),
    p('O bloco do mensal, para colar na proposta:'),
    q(m38.MAINTENANCE_TERMS),
    h('5. Função nova é mais valor'),
    steps(m38.UPSELL),
    p('O cardápio de funções (faixas de referência para sistema pequeno):'),
    list(m38.EXTRAS),
    p('O prompt da lista de funções:'),
    q(m38.BACKLOG_PROMPT),
    h('6. Captação a R$ 0: o conteúdo que traz cliente'),
    steps(m38.CONTENT),
    p('Quatro formatos que funcionam:'),
    list(m38.CONTENT_FORMATS.map((f) => `${f.name}: ${f.what} Exemplo: "${f.example}"`)),
    p('As três primeiras mensagens quando alguém chama:'),
    q(m38.FIRST_REPLY),
    h('7. As armadilhas'),
    list(m38.TRAPS),
    h('8. Por onde começar hoje'),
    check(m38.NEXT),
    c('Fechou o primeiro? Me manda no direct qual dos quatro sistemas foi.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega38]
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
