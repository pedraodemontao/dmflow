/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel OPUS
 * (material 47, "Awesome Opus 5.5 Videos: 513 prompts de vídeo e o seu editor
 * no Claude Code"), com o PDF anexado. Slug curto, como a `28` a `46`: a página
 * fica em dm.nocodepedro.site/e/47, e a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-47.mts             simula
 *   ...scripts/criar-entrega-47.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m47 from '../../nocodepedro-site/app/entrega/entrega-47/content'

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
// Material 47 — Awesome Opus 5.5 Videos: 513 prompts de vídeo e o seu editor no Claude Code
// ---------------------------------------------------------------------------
const entrega47: Entrega = {
  slug: '47',
  title: 'Awesome Opus 5.5 Videos: 513 prompts de vídeo e o seu editor no Claude Code',
  subtitle:
    'Material complementar do post OPUS — o banco de prompts gratuito, como ler e usar os 513, o template do Remotion que vira o seu editor de legendas e o que o vídeo exagerou.',
  pdf: new URL('public/entrega/entrega-47.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Awesome Opus 5.5 Videos é uma lista no GitHub com 513 vídeos que outras pessoas fizeram pedindo ao Claude Opus 5.5 para escrever a animação em código, e o prompt de cada um. Não é um editor nem um programa: é matéria-prima. Você clona, pede ao Claude Code os moldes do seu nicho e usa o template oficial do Remotion para o seu editor de legendas. O prompt é deles; o vídeo é seu.',
    ),
    c(`${m47.REPO_URL} · ${m47.REPO_FACTS}. Conferido no GitHub e rodando no Claude Code em ${m47.CHECKED_AT}.`),
    h('1. O que é'),
    steps(m47.HOW_TO_READ),
    list(m47.CATEGORIES.map((ct) => `${ct.name} (${ct.id}, ${ct.count} vídeos): ${ct.what} Serve para: ${ct.use}`)),
    h('2. Instalar: o banco e o editor'),
    p('O banco na sua máquina (terminal):'),
    q(m47.INSTALL_CLONE),
    p('O jeito do vídeo: cole o link no Claude Code:'),
    q(m47.INSTALL_PASTE),
    p('Teste: cinco moldes para o seu nicho:'),
    q(m47.INSTALL_TEST),
    p('O seu editor de legendas: template TikTok do Remotion:'),
    q(m47.INSTALL_EDITOR),
    p('O que tem dentro do banco:'),
    q(m47.INSTALL_FILES),
    h('3. Quatro prompts para usar hoje'),
    ...m47.PROMPTS.flatMap((pr, i): DeliveryBlock[] => [p(`${i + 1}. ${pr.title}:`), q(pr.text), c(pr.note)]),
    h('4. A verdade sobre o vídeo'),
    steps(m47.TRUTHS),
    h('5. Armadilhas e por onde começar'),
    list(m47.TRAPS),
    check(m47.NEXT),
    c('Fez um vídeo com um prompt daqui? Me manda no direct o link que eu quero ver.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega47]
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
