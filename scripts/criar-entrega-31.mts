/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel
 * REPOSITORIO (material 31, "os 3 repositórios open source"), com o PDF
 * anexado. Slug curto, como a `28`, a `29` e a `30`: a página fica em
 * dm.nocodepedro.site/e/31, e a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-31.mts             simula
 *   ...scripts/criar-entrega-31.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m31 from '../../nocodepedro-site/app/entrega/entrega-31/content'

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
// Material 31 — os 3 repositórios
// ---------------------------------------------------------------------------
const entrega31: Entrega = {
  slug: '31',
  title: 'Os 3 repositórios open source para quem constrói com IA',
  subtitle:
    'Material complementar do post REPOSITORIO — OpenCode, Plandex e Goose: o que cada um faz, a instalação que funciona hoje e como conectar os três.',
  pdf: new URL('public/entrega/entrega-31.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Aqui estão os três repositórios do vídeo com o que cada um faz de verdade, a instalação que funciona hoje, como pagar (ou não) pelo modelo, as pegadinhas e o passo a passo para conectar os três. No fim, um prompt pronto por ferramenta.',
    ),
    c(
      `Estrelas, licenças, releases e comandos conferidos nos READMEs, nas documentações oficiais, na API do GitHub e no Docker Hub em ${m31.CHECKED_AT}. Repositório muda de dono e de comando: confira a data antes de copiar.`,
    ),
    h('1. Antes de instalar'),
    list(m31.HOW_TO_READ.map((i) => `${i.title}. ${i.text}`)),
    ...m31.REPOS.flatMap((r, i) => [
      h(`${i + 2}. ${r.name}`),
      q(`No vídeo: "${r.videoSaid}"`),
      p(
        `${r.stars} estrelas · licença ${r.license} · ${r.language} · último release ${r.release} em ${r.releaseDate} · no GitHub desde ${r.created} · mantido por ${r.org}. GitHub: ${r.github}. Documentação: ${r.site}.`,
      ),
      ...(r.status ? [c(`O estado real em ${m31.CHECKED_AT}: ${r.status.join(' ')}`)] : []),
      p('O que ele faz de verdade:'),
      list(r.what),
      p(`Instalar o ${r.name}:`),
      q(r.install),
      p('Primeiro uso:'),
      steps(r.firstRun),
      p('Grátis e pago:'),
      list(r.models),
      p('Pegadinhas:'),
      list(r.watch),
    ]),
    h('5. Conectar os três'),
    p('O que o vídeo prometeu: uma chave, um arquivo de contexto, os mesmos MCPs e cada um no seu tamanho de tarefa.'),
    steps(m31.CONNECT),
    p('O mesmo MCP no OpenCode e no Goose:'),
    q(m31.MCP_CONFIG),
    h('6. Os prompts prontos'),
    p('Um por ferramenta. Troque o que está entre colchetes.'),
    ...m31.PROMPTS.flatMap((pr) => [p(`${pr.title}:`), q(pr.text)]),
    h('7. As armadilhas'),
    list(m31.TRAPS),
    h('8. O que esperar de verdade'),
    list(m31.REALITY),
    h('9. Por onde começar hoje'),
    check(m31.NEXT),
    c('Instalou qual primeiro? Me manda no direct o que ele fez no seu projeto.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega31]
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
