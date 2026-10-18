/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel HYPER
 * (material 55, "HyperFrames: edite vídeo por prompt com o seu próprio padrão"),
 * com o PDF anexado. Slug curto, como a `28` a `54`: a página
 * fica em dm.nocodepedro.site/e/55, e a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-55.mts             simula
 *   ...scripts/criar-entrega-55.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m55 from '../../nocodepedro-site/app/entrega/entrega-55/content'

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
// Material 55 — HyperFrames: edite vídeo por prompt com o seu próprio padrão
// ---------------------------------------------------------------------------
const entrega55: Entrega = {
  slug: '55',
  title: 'HyperFrames: edite vídeo por prompt com o seu próprio padrão',
  subtitle:
    'Material complementar do post HYPER — o repositório grátis da HeyGen: instalar em três passos, um prompt pronto para cada uma das três skills do vídeo, o seu design system num arquivo e qual modelo usar.',
  pdf: new URL('public/entrega/entrega-55.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'HyperFrames é um repositório grátis da HeyGen que instala skills de edição de vídeo no seu Claude Code ou Codex. Você pede por texto (ou ditando), o agente escreve o vídeo como HTML e renderiza na sua máquina, sempre com o padrão que está no seu frame.md.',
    ),
    c(`Conferido no repositório e rodando a versão 0.8.163 em ${m55.CHECKED_AT}.`),
    h('1. O que é'),
    steps(m55.WHAT_IS),
    h('2. Instalar em três passos'),
    p('Cole no terminal, dentro da pasta onde está o seu vídeo.'),
    q(m55.INSTALL),
    c(m55.INSTALL_NOTE),
    h('3. As três skills do vídeo, com o prompt de cada'),
    p('Os colchetes são seus. Pode colar ou ditar: o agente lê do mesmo jeito.'),
    ...m55.SKILLS.flatMap((s, i): DeliveryBlock[] => [p(`${i + 1}. ${s.name}. ${s.what}`), q(s.prompt)]),
    h('4. O seu padrão em um arquivo'),
    p('Faça isto antes do primeiro vídeo. É o que o vídeo chama de configurar o seu próprio design system.'),
    q(m55.FRAME_PROMPT),
    steps(m55.FRAME_NOTES),
    h('5. Qual modelo usar'),
    list(m55.MODELS.map((m) => `${m.name}: ${m.agent} Preço: ${m.price} No meu uso: ${m.note}`)),
    c(m55.MODEL_NOTE),
    h('6. A verdade sobre o vídeo'),
    steps(m55.TRUTHS),
    h('7. Por onde começar hoje'),
    check(m55.NEXT),
    c('Editou o primeiro? Me manda no direct o vídeo que saiu.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega55]
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
