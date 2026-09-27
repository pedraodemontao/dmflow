/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel
 * DESIGN (material 32, "biblioteca de design systems com o Dembrandt"), com o
 * PDF anexado. Slug curto, como a `28` a `31`: a página fica em
 * dm.nocodepedro.site/e/32, e a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-32.mts             simula
 *   ...scripts/criar-entrega-32.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m32 from '../../nocodepedro-site/app/entrega/entrega-32/content'

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
// Material 32 — biblioteca de design systems com o Dembrandt
// ---------------------------------------------------------------------------
const entrega32: Entrega = {
  slug: '32',
  title: 'Sua biblioteca de design systems com o Dembrandt',
  subtitle:
    'Material complementar do post DESIGN — extrair o design system de qualquer site num DESIGN.md, guardar numa biblioteca de referências e usar no Claude Code.',
  pdf: new URL('public/entrega/entrega-32.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Aqui está o passo a passo do vídeo: instalar o Dembrandt, extrair o design system de um site, montar a sua biblioteca de referências numa pasta e usar no Claude Code. Com o script que salva vários sites de uma vez e quatro prompts prontos.',
    ),
    c(
      `Comandos e opções conferidos no README e na documentação oficial (${m32.TOOL.release}) e rodando a ferramenta no nosso próprio site em ${m32.CHECKED_AT}. A ferramenta lança versão quase toda semana: confira a data antes de copiar.`,
    ),
    h('Antes de começar'),
    list(m32.HOW_TO_READ.map((i) => `${i.title}. ${i.text}`)),
    h('1. Instalar o Dembrandt'),
    p(
      `${m32.TOOL.stars} estrelas · ${m32.TOOL.downloads} no npm · licença ${m32.TOOL.license}, gratuito · precisa de ${m32.TOOL.node}. GitHub: ${m32.TOOL.github}. Site: ${m32.TOOL.site}.`,
    ),
    q(m32.INSTALL),
    steps(m32.INSTALL_STEPS),
    h('2. Extrair o primeiro site'),
    p('O comando do vídeo, com as três opções que fazem ele salvar o que a IA precisa:'),
    q(m32.FIRST_EXTRACTION),
    p('As opções que valem a pena:'),
    list(m32.FLAGS.map((f) => `${f.flag}: ${f.what} Quando: ${f.when}`)),
    h('3. O que sai de verdade'),
    p(`Rodamos no nosso próprio site (${m32.REAL_RUN.site}): ${m32.REAL_RUN.command}`),
    p('O que ele acertou:'),
    list(m32.REAL_RUN.found),
    p('O que precisou de olho humano:'),
    list(m32.REAL_RUN.missed),
    h('4. Montar a biblioteca de referências'),
    p('Uma pasta sua, um site por subpasta, e a IA sabendo como ler. A pasta fica assim:'),
    q(m32.LIBRARY_TREE),
    steps(m32.LIBRARY_STEPS),
    p('~/referencias-design/CLAUDE.md, as regras que a IA segue:'),
    q(m32.LIBRARY_RULES),
    p('Script de lote, para salvar vários sites de uma vez:'),
    q(m32.BATCH_SCRIPT),
    h('5. Os prompts prontos'),
    p('Para colar no Claude Code. Troque o que está entre colchetes.'),
    ...m32.PROMPTS.flatMap((pr) => [p(`${pr.title}:`), q(pr.text)]),
    h('6. Atalho: o Dembrandt dentro do Claude Code'),
    q(m32.MCP),
    list(m32.MCP_NOTES),
    h('7. As armadilhas'),
    list(m32.TRAPS),
    h('8. O que esperar de verdade'),
    list(m32.REALITY),
    h('9. Por onde começar hoje'),
    check(m32.NEXT),
    c('Montou a sua biblioteca? Me manda no direct o primeiro site que você salvou.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega32]
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
