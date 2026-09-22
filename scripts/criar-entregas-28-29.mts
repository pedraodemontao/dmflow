/**
 * Publica na aba Biblioteca → Entregas o material complementar dos posts
 * PROMPT (material 28, reel DdfHkslqDhM) e MAESTRO (material 29, carrossel
 * DdhIC7-Gs8h), com o PDF anexado. Slug curto, como a entrega `20`: a página
 * fica em dm.nocodepedro.site/e/28 e /e/29, e a automação aponta para ela
 * com `{{presente}}`.
 *
 *   ...scripts/criar-entregas-28-29.mts             simula
 *   ...scripts/criar-entregas-28-29.mts --aplicar   grava, sobe o PDF e PUBLICA
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * O texto NÃO mora aqui: vem do `content.ts` de cada material no projeto do
 * site (~/projects/nocodepedro-site). Copiar o texto para cá faria a página do
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
import * as m28 from '../../nocodepedro-site/app/entrega/entrega-28/content'
import * as m29 from '../../nocodepedro-site/app/entrega/entrega-29/content'

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
// Material 28 — comentário vira pauta
// ---------------------------------------------------------------------------
const entrega28: Entrega = {
  slug: '28',
  title: 'O sistema que lê os comentários do seu nicho e te entrega a pauta',
  subtitle:
    'Material complementar do post PROMPT — Claude com o conector da Apify, ou Claude Code com yt-dlp, e os três prompts.',
  pdf: new URL('public/entrega/entrega-28.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Aqui está a estrutura do vídeo: a biblioteca de referências do nicho, a régua que separa o que estourou e a regra que transforma comentário em pauta com prova. Leia na ordem. O que faz o sistema funcionar não é a raspagem, é a regra.',
    ),
    c(
      'Coletores, preços e o conector conferidos na documentação da Apify em 18/09/2026. Os comandos do yt-dlp e as regras são os que rodam no painel do vídeo. Preço da Apify muda por plano: o prompt da seção 5 pede a estimativa antes de gastar.',
    ),
    h('1. O que o sistema faz'),
    list(m28.WHAT_IS.map((i) => `${i.title}. ${i.text}`)),
    h('2. Os números da tela do vídeo'),
    p('É o painel rodando de verdade, não maquete. Todos contados, nenhum estimado.'),
    list(m28.PROOF.map((i) => `${i.value} ${i.label}: ${i.text}`)),
    h('3. O sistema em seis etapas'),
    steps(m28.PIPELINE),
    h('4. Dois caminhos para coletar'),
    p('Escolha pela escala, não pela ferramenta. Instagram é outra história: ali a coleta passa pela Apify e é paga.'),
    list(m28.ROUTES.map((i) => `${i.title} (${i.who}). ${i.text}`)),
    h('5. Conectar a Apify no Claude'),
    steps(m28.APIFY_STEPS),
    list(m28.ACTORS.map((i) => `${i.id}: ${i.use}`)),
    p('O prompt para mapear o nicho e os pedidos do público pelo Claude:'),
    q(m28.APIFY_PROMPT),
    h('6. Coletar de graça pelo terminal'),
    p('Os mesmos dois comandos que alimentam o painel do vídeo. Sem chave, sem custo, só mais lento.'),
    q(m28.YTDLP_COMMANDS),
    h('7. A régua: o que estourou de verdade'),
    steps(m28.RULER),
    p('A régua completa, com o fator viral para Instagram, está no material 25: nocodepedro.site/25'),
    h('8. Como um comentário vira pauta'),
    p('É onde o número mente se a regra estiver errada. A segunda regra derrubou um tema de 40% para 13,3%.'),
    steps(m28.MATCH_RULES),
    h('9. A anatomia de uma pauta'),
    list(m28.PAUTA_FIELDS.map((i) => `${i.field}: ${i.text}`)),
    p('Uma pauta no formato certo (exemplo inventado; os números da sua vêm da contagem):'),
    q(m28.PAUTA_EXAMPLE),
    h('10. O prompt que monta o sistema'),
    p('Para o Claude Code. Ele constrói em quatro etapas e para no fim de cada uma para você conferir.'),
    q(m28.BUILD_PROMPT),
    h('11. O prompt que transforma comentário em pauta'),
    p('Funciona no Claude com o arquivo de comentários anexado, sem sistema nenhum.'),
    q(m28.PAUTAS_PROMPT),
    h('12. As treze armadilhas'),
    list(m28.TRAPS),
    h('13. O que esperar de verdade'),
    list(m28.REALITY),
    h('14. Por onde começar hoje'),
    check(m28.NEXT),
    c('Montou a sua aba de pedidos? Me manda no direct a pauta que mais apareceu nos seus comentários.'),
  ],
}

// ---------------------------------------------------------------------------
// Material 29 — sete IAs gratuitas e o maestro
// ---------------------------------------------------------------------------
const entrega29: Entrega = {
  slug: '29',
  title: 'Sete IAs gratuitas e o maestro que junta todas',
  subtitle:
    'Material complementar do post MAESTRO — os sete links, o que cada uma faz melhor e a ordem em que eu montaria o seu time.',
  pdf: new URL('public/entrega/entrega-29.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Aqui estão as sete, com o link, o que é grátis de verdade e o primeiro comando de cada uma. Depois, a ordem de montar o time, os prompts de cada papel e como fazer as sete trabalharem ao mesmo tempo.',
    ),
    c(
      `Conferido nas fontes oficiais em ${m29.CHECKED_AT}. Uma mudança importa: o grátis do Gemini CLI com conta pessoal acabou em 18/06/2026. O sucessor, do próprio Google, é o Antigravity CLI — é ele o item 01 abaixo.`,
    ),
    h('1. Antes de começar: o que o Max vende'),
    list(m29.WHAT_YOU_PAY.map((i) => `${i.title}. ${i.text}`)),
    h('2. As sete, com o link'),
    ...m29.TOOLS.flatMap((t) => [
      p(`${t.n} · ${t.name} — ${t.role.toLowerCase()}. ${t.best}`),
      list([`Grátis: ${t.free}`, `Cuidado: ${t.watch}`, `Link: ${t.link}`]),
      q(t.start),
    ]),
    h('3. A ordem em que eu montaria o seu time'),
    p('Começa pelo que trabalha no primeiro dia e termina no que depende da sua máquina.'),
    steps(m29.ORDER),
    h('4. Uma tarefa passando pelo time'),
    steps(m29.TASK_FLOW),
    h('5. O maestro: as sete ao mesmo tempo'),
    list(m29.ORCHESTRATION.map((i) => `${i.title} (${i.who}). ${i.text}`)),
    steps(m29.MAESTRI_STEPS),
    p('O script que monta o time no Maestri (salve como montar-time.sh):'),
    q(m29.MAESTRI_SCRIPT),
    h('6. Os prompts de cada papel'),
    p('Planejador (Kimi):'),
    q(m29.PLANNER_PROMPT),
    p('Executor (Antigravity CLI ou opencode):'),
    q(m29.EXECUTOR_PROMPT),
    p('Revisor (DeepSeek):'),
    q(m29.REVIEWER_PROMPT),
    p('Memória (Gemini Notebook):'),
    q(m29.NOTEBOOK_PROMPT),
    h('7. As armadilhas'),
    list(m29.TRAPS),
    h('8. O que esperar de verdade'),
    list(m29.REALITY),
    h('9. Por onde começar hoje'),
    check(m29.NEXT),
    c('Montou o seu time? Me conta no direct qual das sete virou a titular.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega28, entrega29]
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
    ? '\nPronto. As duas aparecem em Biblioteca → Entregas e podem ser escolhidas na automação ({{presente}}).'
    : '\nSimulação. Rode de novo com --aplicar para gravar e publicar.',
)
