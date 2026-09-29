/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel
 * WHATSAPP (material 34, "Claude no WhatsApp: onde a sua venda escorre"), com o
 * PDF anexado. Slug curto, como a `28` a `33`: a página fica em
 * dm.nocodepedro.site/e/34, e a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-34.mts             simula
 *   ...scripts/criar-entrega-34.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m34 from '../../nocodepedro-site/app/entrega/entrega-34/content'

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
// Material 34 — Claude no WhatsApp: onde a sua venda escorre
// ---------------------------------------------------------------------------
const entrega34: Entrega = {
  slug: '34',
  title: 'Claude no WhatsApp: onde a sua venda escorre',
  subtitle:
    'Material complementar do post WHATSAPP — o Claude no Chrome lê as conversas do WhatsApp Web e monta o funil: o agente, o relatório, o script novo e a varredura semanal.',
  pdf: new URL('public/entrega/entrega-34.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Aqui está o que o vídeo prometeu: o agente que varre as suas conversas do WhatsApp, o prompt que transforma a varredura no relatório do funil e o prompt que reescreve o seu script a partir dele. Com o modo leitura que impede o Claude de responder alguém.',
    ),
    c(
      `Conferido em ${m34.CHECKED_AT} na central de ajuda da Anthropic. O Claude no Chrome funciona nos planos ${m34.TOOL.plans}, só no Google Chrome.`,
    ),
    h('Antes de começar'),
    list(m34.HOW_TO_READ.map((i) => `${i.title}. ${i.text}`)),
    h('1. O que você precisa'),
    steps(m34.REQUIREMENTS),
    h('2. Instalar o Claude no Chrome'),
    steps(m34.INSTALL),
    h('3. Preparar o WhatsApp'),
    steps(m34.PREP),
    h('4. O agente que varre as conversas'),
    p('Cole no painel do Claude, com o WhatsApp Web aberto na mesma aba. Troque o que está entre colchetes.'),
    q(m34.AGENT.text),
    steps(m34.SHORTCUT_STEPS),
    h('5. O relatório'),
    q(m34.REPORT.text),
    steps(m34.REPORT_STEPS),
    h('6. Do relatório ao script novo'),
    q(m34.SCRIPT.text),
    h('7. Toda semana'),
    q(m34.WEEKLY.text),
    steps(m34.WEEKLY_STEPS),
    h('8. O que o relatório costuma achar'),
    list(m34.FINDINGS.map((f) => `${f.name}: ${f.means} O que fazer: ${f.fix}`)),
    h('9. As armadilhas'),
    list(m34.TRAPS),
    h('10. O que esperar de verdade'),
    list(m34.REALITY),
    h('11. Por onde começar hoje'),
    check(m34.NEXT),
    c('Rodou a varredura? Me manda no direct qual foi o vazamento que mais te surpreendeu.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega34]
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
