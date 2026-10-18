/**
 * Monta a automação do reel "HyperFrames: o repositório grátis para editar
 * vídeo por prompt" (material 55, reel 23-hyperframes-C-editor de 16/10/2026,
 * 40 s: as skills /embedded-captions, /talking-head-recut e /motion-graphics,
 * o frame.md como design system e Fable 5 ou GPT-6 Astra como modelo): fluxo
 * com remarketing e gatilho da palavra HYPER. O material é a entrega /e/55
 * do painel (mesmo texto de nocodepedro.site/55).
 *
 *   ...scripts/criar-automacao-hyper-55.mts                         simula
 *   ...scripts/criar-automacao-hyper-55.mts --post=<código> --aplicar grava, ATIVA e prende ao reel
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * Mesma estrutura do `criar-automacao-modelo-54.mts` (postback → wait_reply →
 * link → 5 min → checagem → 1 h → bônus → 19 h → grupo); o porquê de cada
 * parada está no `criar-automacao-vibecoding.mts`.
 *
 * Gatilho: "hyper". O matcher é `contains` sem acento e sem caixa, então pega
 * todo comentário que cita "hyperframes" — e HYPER já é a palavra do material
 * 26 (HyperFrames, 16/09). Os dois só convivem presos cada um ao seu post.
 * Quando este script nasceu o reel ainda não estava publicado, então NÃO há
 * post padrão: `--aplicar` exige `--post=<código>` e recusa gatilho solto.
 *
 * A conta é escolhida pelo NOME (`--conta=`, padrão lowcodepedro), nunca pela
 * mais antiga. O media_id vem da Graph API com o token da conta, o que exige a
 * conta reconectada.
 */
import { checkFlowTexts, checkPublicReply } from '../src/lib/flow/variation'
import { flowDefinitionSchema, type FlowDefinition } from '../src/lib/flow/types'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null
const APLICAR = process.argv.includes('--aplicar')
const CONTA = arg('conta') ?? 'lowcodepedro'
const POST = arg('post')

const FLUXO_NOME = 'Comentário HYPER → material 55'
/**
 * A entrega da aba Biblioteca → Entregas (`criar-entrega-55.mts`). O botão
 * leva `{{presente}}`, que o motor troca por /e/55?c=<token do contato>:
 * é isso que conta QUEM abriu, coisa que o link do site não conta.
 */
const ENTREGA_SLUG = '55'
/** O 26 é o HyperFrames completo: as vinte skills, o frame.md inteiro e os treze presets. É o aprofundamento natural. */
const BONUS_URL = 'https://www.nocodepedro.site/26'
const GRUPO_URL = 'https://chat.whatsapp.com/CSkDAbCjNqF8RwjT82f4fU'

const RESPOSTA_PUBLICA =
  '{Mandei no seu direct! 📩|Chegou no privado ✨|Te respondi no direct 😉|Corre no direct que tá lá 👀}'

const def: FlowDefinition = {
  entry: 'inicio',
  nodes: {
    // Private reply COM BOTÃO POSTBACK: é o toque nele que abre a janela de 24h.
    inicio: {
      type: 'buttons',
      text:
        '{Oi {{nome}}! Vi seu comentário 👋|Fala {{nome}}! Recebi seu comentário 👋|E aí {{nome}}, vi o HYPER ali 🎬} ' +
        '{Toca no botão que eu te mando o passo a passo completo.|Aperta o botão aí embaixo que eu libero o passo a passo agora.|Clica no botão e o material vem na hora, com os prompts prontos.}',
      buttons: [{ title: 'Quero o material', payload: 'quero_passo_55' }],
      next: 'espera_toque',
    },
    // Sem esta parada o delay abaixo dispararia com a janela ainda fechada.
    espera_toque: { type: 'wait_reply', next: 'entrega' },
    entrega: {
      type: 'buttons',
      text:
        '{Tá aqui, {{nome}} 👇|Chegou 👇|É esse aqui, {{nome}} 👇} ' +
        '{Como instalar o HyperFrames, um prompt pronto para cada skill do vídeo e o seu design system num arquivo.|O passo a passo do HyperFrames: instalação em três passos, os três prompts e qual modelo usar.}',
      buttons: [{ title: 'Abrir o material', url: '{{presente}}' }],
      next: 'espera_5min',
    },
    espera_5min: { type: 'delay', seconds: 5 * 60, next: 'checagem' },
    // Sem botão: o run está `sleeping` aqui e toque não retomaria nada.
    checagem: {
      type: 'message',
      text:
        '{E aí {{nome}}, conseguiu abrir o material?|{{nome}}, deu certo abrir a página?|Conseguiu acessar, {{nome}}?} ' +
        '{Começa pelo prompt do frame.md: é ele que deixa todo vídeo no seu padrão. Qualquer dúvida, me responde aqui.|Qualquer coisa é só responder aqui que eu vejo.}',
      next: 'espera_1h',
    },
    espera_1h: { type: 'delay', seconds: 60 * 60, next: 'bonus' },
    bonus: {
      type: 'buttons',
      text:
        '{Aproveita que você tá nessa 👇|Mais um pra você 👇|Já que você tá no HyperFrames 👇} ' +
        '{É o material completo do HyperFrames: as vinte skills, um frame.md inteiro e os treze presets.|Deixo também o guia completo do HyperFrames, com o frame.md pronto para trocar as cores.}',
      buttons: [{ title: 'Ver o material', url: BONUS_URL }],
      next: 'espera_1dia',
    },
    espera_1dia: { type: 'delay', seconds: 19 * 60 * 60, next: 'convite' },
    convite: {
      type: 'buttons',
      text:
        '{Última coisa, {{nome}} 👇|Pra fechar, {{nome}} 👇|Fecho com essa 👇} ' +
        '{Tenho um grupo de quem tá construindo com IA — é lá que eu solto primeiro o que funciona.|Abri um grupo de quem constrói com IA; o que dá certo aparece lá antes.}',
      buttons: [{ title: 'Entrar no grupo', url: GRUPO_URL }],
      next: null,
    },
  },
  layout: {
    inicio: { x: 0, y: 0 },
    espera_toque: { x: 0, y: 180 },
    entrega: { x: 0, y: 340 },
    espera_5min: { x: 0, y: 520 },
    checagem: { x: 0, y: 680 },
    espera_1h: { x: 0, y: 860 },
    bonus: { x: 0, y: 1020 },
    espera_1dia: { x: 0, y: 1200 },
    convite: { x: 0, y: 1360 },
  },
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o que o painel recusaria, o script
// também recusa.
// ---------------------------------------------------------------------------
flowDefinitionSchema.parse(def)

const textos = Object.entries(def.nodes).flatMap(([id, node]) =>
  'text' in node && typeof node.text === 'string' ? [{ id, label: id, text: node.text }] : [],
)
const problemas = [checkPublicReply(RESPOSTA_PUBLICA), ...checkFlowTexts(textos)].filter(Boolean)
if (problemas.length > 0) {
  console.error('Trava de variação recusaria isto:')
  for (const p of problemas) console.error(`  • ${p!.where}: ${p!.message}`)
  process.exit(1)
}

/** Varre as mídias da conta atrás do código do post (o trecho da URL depois de /p/ ou /reel/). */
async function mediaIdDoPost(token: string, codigo: string): Promise<string> {
  let url: string | null = `https://graph.instagram.com/v23.0/me/media?fields=id,permalink&limit=50&access_token=${token}`
  for (let pagina = 0; url && pagina < 10; pagina++) {
    const res = (await fetch(url).then((r) => r.json())) as {
      data?: { id: string; permalink?: string }[]
      paging?: { next?: string }
      error?: { message: string }
    }
    if (res.error) throw new Error(`Graph API recusou (reconecte a conta no painel): ${res.error.message}`)
    const achado = res.data?.find((m) => m.permalink?.includes(`/${codigo}/`))
    if (achado) return achado.id
    url = res.paging?.next ?? null
  }
  throw new Error(`post ${codigo} não está entre as mídias de @${CONTA}`)
}

const { data: contaRow } = await supabaseAdmin
  .from('accounts')
  .select('id, username, access_token')
  .eq('username', CONTA)
  .maybeSingle()
const conta = contaRow as { id: string; username: string; access_token: string } | null

console.log('FLUXO')
console.log(`  ${APLICAR ? '→' : '·'} "${FLUXO_NOME}"`)
console.log('     inicio(botão) → espera toque → entrega /e/55 ({{presente}}) → 5 min → checagem → 1 h → material 26 → 19 h → grupo')
console.log('\nGATILHO')
console.log(`  ${APLICAR ? '→' : '·'} comment ["hyper"] no post ${POST ?? '(falta --post)'}, contains, prioridade 20, ATIVO`)
console.log(`     resposta pública: ${RESPOSTA_PUBLICA}\n`)

if (!conta) {
  const { data: todas } = await supabaseAdmin.from('accounts').select('username')
  const nomes = ((todas ?? []) as { username: string }[]).map((c) => `@${c.username}`).join(', ') || 'nenhuma'
  console.error(`@${CONTA} não está conectada ao dm-flow (contas no banco: ${nomes}).`)
  console.error('Conecte pelo painel (dm.nocodepedro.site) ou passe --conta=<username>.')
  process.exit(APLICAR ? 1 : 0)
}

if (!POST) {
  console.error('Sem --post=<código>: "hyper" solto pegaria todo comentário sobre HyperFrames, inclusive do post da 26.')
  process.exit(APLICAR ? 1 : 0)
}

const MEDIA_ID = await mediaIdDoPost(conta.access_token, POST)
console.log(`conta @${conta.username}${APLICAR ? '' : '   (SIMULAÇÃO — nada será gravado)'}`)
console.log(`post   ${POST} → media ${MEDIA_ID}`)

if (!APLICAR) {
  console.log('\nSimulação. Rode de novo com --aplicar para gravar.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 0. Entrega — tem que existir e estar publicada: rascunho responde 404 em /e,
//    e sem ela `{{presente}}` vira botão sem link.
// ---------------------------------------------------------------------------
const { data: entregaRow } = await supabaseAdmin
  .from('deliveries')
  .select('id, status')
  .eq('slug', ENTREGA_SLUG)
  .maybeSingle()
const entrega = entregaRow as { id: string; status: string } | null
if (entrega?.status !== 'published') {
  console.error(`Entrega /e/${ENTREGA_SLUG} ${entrega ? 'em rascunho' : 'não existe'}: rode antes scripts/criar-entrega-55.mts --aplicar.`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. Fluxo
// ---------------------------------------------------------------------------
const { data: fluxoExistente } = await supabaseAdmin
  .from('flows')
  .select('id')
  .eq('account_id', conta.id)
  .eq('name', FLUXO_NOME)
  .maybeSingle()

let fluxoId = (fluxoExistente as { id: string } | null)?.id ?? null
if (fluxoId) {
  const { error } = await supabaseAdmin
    .from('flows')
    .update({ definition: def, delivery_id: entrega.id, is_active: true, updated_at: new Date().toISOString() })
    .eq('id', fluxoId)
  if (error) throw new Error(`fluxo não atualizado: ${error.message}`)
} else {
  const { data, error } = await supabaseAdmin
    .from('flows')
    .insert({ account_id: conta.id, name: FLUXO_NOME, definition: def, delivery_id: entrega.id, is_active: true })
    .select('id')
    .single()
  if (error) throw new Error(`fluxo não gravado: ${error.message}`)
  fluxoId = (data as { id: string }).id
}

// ---------------------------------------------------------------------------
// 2. Gatilho — idempotente pelo fluxo: rodar de novo só atualiza o existente.
// ---------------------------------------------------------------------------
const { data: gatilhoExistente } = await supabaseAdmin
  .from('triggers')
  .select('id')
  .eq('flow_id', fluxoId)
  .eq('type', 'comment')
  .maybeSingle()

const payload = {
  account_id: conta.id,
  flow_id: fluxoId,
  type: 'comment',
  keywords: ['hyper'],
  match_mode: 'contains',
  media_id: MEDIA_ID,
  public_reply: RESPOSTA_PUBLICA,
  priority: 20,
  is_active: true,
}

const { error } = gatilhoExistente
  ? await supabaseAdmin.from('triggers').update(payload).eq('id', (gatilhoExistente as { id: string }).id)
  : await supabaseAdmin.from('triggers').insert(payload)
if (error) throw new Error(`gatilho não gravado: ${error.message}`)

console.log(`\nPronto. A automação está ATIVA — comentário novo com "hyper" no reel ${POST} já entra no funil.`)
