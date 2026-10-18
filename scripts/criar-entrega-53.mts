/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel PLUGIN
 * (material 53, "Os 5 plugins para ativar no seu Claude Code"),
 * com o PDF anexado. Slug curto, como a `28` a `52`: a página
 * fica em dm.nocodepedro.site/e/53, e a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-53.mts             simula
 *   ...scripts/criar-entrega-53.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m53 from '../../nocodepedro-site/app/entrega/entrega-53/content'

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
// Material 53 — Os 5 plugins para ativar no seu Claude Code
// ---------------------------------------------------------------------------
const entrega53: Entrega = {
  slug: '53',
  title: 'Os 5 plugins para ativar no seu Claude Code',
  subtitle:
    'Material complementar do post PLUGIN — Claude Code Setup, Claude-Mem, Headroom, Task Observer e OmniRoute: a instalação de cada um, um prompt pronto para cada, quanto custou no meu teste e o que o vídeo exagerou.',
  pdf: new URL('public/entrega/entrega-53.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Claude Code Setup recomenda automações, Claude-Mem guarda a memória entre sessões, Headroom encolhe o que o Claude lê, Task Observer transforma o seu jeito de trabalhar em skill e OmniRoute passa a tarefa para outro provedor. Três são plugins; dois são programas que rodam na sua máquina.',
    ),
    c(`Instalados e testados no Claude Code em ${m53.CHECKED_AT}.`),
    h('1. O que é'),
    steps(m53.HOW_TO_READ),
    list(m53.PLUGINS.map((k) => `${k.name} (${k.kind}): ${k.does} Custo: ${k.cost} github.com/${k.repo}`)),
    h('2. Instalar'),
    ...m53.PLUGINS.flatMap((k): DeliveryBlock[] => [p(`${k.name}:`), q(k.install)]),
    p('Task Observer, bloco de ativação para o CLAUDE.md (em inglês, como o autor escreveu):'),
    q(m53.TASK_OBSERVER_BLOCK),
    p('Conferir os cinco:'),
    q(m53.INSTALL_CHECK),
    h('3. Um prompt para cada um'),
    ...m53.PLUGINS.flatMap((k, i): DeliveryBlock[] => [p(`${i + 1}. ${k.name}:`), q(k.prompt), c(k.note)]),
    h('4. A verdade sobre o vídeo'),
    steps(m53.TRUTHS),
    h('5. Por onde começar hoje'),
    check(m53.NEXT),
    c('Instalou algum? Me manda no direct qual dos cinco ficou.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega53]
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
