/**
 * Publica na aba Biblioteca → Entregas o material complementar do reel CLONE
 * (material 50, "Replica: 11 skills para clonar um app (e fazer melhor)"),
 * com o PDF anexado. Slug curto, como a `28` a `47`: a página
 * fica em dm.nocodepedro.site/e/50, e a automação aponta para ela com `{{presente}}`.
 *
 *   ...scripts/criar-entrega-50.mts             simula
 *   ...scripts/criar-entrega-50.mts --aplicar   grava, sobe o PDF e PUBLICA
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
import * as m50 from '../../nocodepedro-site/app/entrega/entrega-50/content'

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
// Material 50 — Replica: 11 skills para clonar um app (e fazer melhor)
// ---------------------------------------------------------------------------
const entrega50: Entrega = {
  slug: '50',
  title: 'Replica: 11 skills para clonar um app (e fazer melhor)',
  subtitle:
    'Material complementar do post CLONE — as 11 skills do repositório gratuito, como instalar, os temas em português para ler avaliações, três prompts prontos e o que o vídeo exagerou.',
  pdf: new URL('public/entrega/entrega-50.pdf', SITE),
  pdfAfter: 1,
  blocks: [
    p(
      'Replica é um pacote gratuito de onze skills para o Claude Code: uma mapeia o app que você quer clonar, outras planejam, desenham, constroem e testam a sua versão, uma compara com o original e dá nota de paridade, e o Empreendedor lê o que os usuários do original odeiam para você consertar no seu. Refaz o que o app faz, escrito do zero; nunca o código, o logo ou o texto.',
    ),
    c(`${m50.REPO_URL} · ${m50.REPO_FACTS}. Conferido no GitHub e rodando no Claude Code em ${m50.CHECKED_AT}.`),
    h('1. O que é'),
    steps(m50.HOW_TO_READ),
    list(m50.ELEVEN.map((s) => `${s.command} (${s.job}): ${s.does}`)),
    h('2. Instalar'),
    p('Como plugin, dentro do Claude Code:'),
    q(m50.INSTALL_PLUGIN),
    p('Copiando as pastas (comandos sem prefixo):'),
    q(m50.INSTALL_CLONE),
    p('O jeito do vídeo: cole o link no Claude Code:'),
    q(m50.INSTALL_PASTE),
    p('Conferir que está tudo certo, sem Claude:'),
    q(m50.INSTALL_VERIFY),
    p('temas_pt.py: o Empreendedor lendo avaliação em português:'),
    q(m50.THEMES_PT),
    q(m50.THEMES_PT_RUN),
    h('3. Três prompts para usar hoje'),
    ...m50.PROMPTS.flatMap((pr, i): DeliveryBlock[] => [p(`${i + 1}. ${pr.title}:`), q(pr.text), c(pr.note)]),
    h('4. A verdade sobre o vídeo'),
    steps(m50.TRUTHS),
    h('5. Por onde começar hoje'),
    check(m50.NEXT),
    c('Clonou um app com isso? Me manda no direct qual foi e o que você consertou nele.'),
  ],
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o mesmo schema da edição no painel.
// ---------------------------------------------------------------------------
const ENTREGAS = [entrega50]
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
