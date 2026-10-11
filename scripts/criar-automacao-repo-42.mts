/**
 * Monta a automação do reel "os 3 repositórios" (material 42, vídeo
 * 99E7A531…MP4 de 04/10: Browser Use, Superpowers, Context7): fluxo com
 * remarketing e gatilho da palavra REPO. O material é a entrega /e/42 do
 * painel (mesmo texto de nocodepedro.site/42).
 *
 *   ...scripts/criar-automacao-repo-42.mts                                simula
 *   ...scripts/criar-automacao-repo-42.mts --post=<código> --aplicar
 *                                                                         grava, ATIVA e prende ao reel
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * Mesma estrutura do `criar-automacao-prompt-41.mts` (postback → wait_reply →
 * link → 5 min → checagem → 1 h → bônus → 19 h → grupo); o porquê de cada
 * parada está no `criar-automacao-vibecoding.mts`.
 *
 * Gatilho: "repo". O matcher é `contains`: "repo" está dentro de
 * "repositorio", a palavra do material 31, e de "repost". Os dois
 * só convivem presos cada um ao seu `media_id`: por isso o script RECUSA
 * aplicar sem `--post`, como o 36 ao 41.
 *
 * A conta é escolhida pelo NOME (`--conta=`, padrão lowcodepedro), nunca pela
 * mais antiga. `--post=<código>` acha o media_id pela Graph API com o token da
 * conta, o que exige a conta reconectada.
 */
import { checkFlowTexts, checkPublicReply } from '../src/lib/flow/variation'
import { flowDefinitionSchema, type FlowDefinition } from '../src/lib/flow/types'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || null
const APLICAR = process.argv.includes('--aplicar')
const CONTA = arg('conta') ?? 'lowcodepedro'
const POST = arg('post')

const FLUXO_NOME = 'Comentário REPO → material 42'
/**
 * A entrega da aba Biblioteca → Entregas (`criar-entrega-42.mts`). O botão
 * leva `{{presente}}`, que o motor troca por /e/42?c=<token do contato>:
 * é isso que conta QUEM abriu, coisa que o link do site não conta.
 */
const ENTREGA_SLUG = '42'
/** O 31 é a outra lista de repositórios (OpenCode, Goose, Plandex). Um pede o outro. */
const BONUS_URL = 'https://www.nocodepedro.site/31'
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
        '{Oi {{nome}}! Vi seu comentário 👋|Fala {{nome}}! Recebi seu comentário 👋|E aí {{nome}}, vi o REPO ali 🧰} ' +
        '{Toca no botão que eu te mando a lista completa.|Aperta o botão aí embaixo que eu libero os três repositórios agora.|Clica no botão e a lista vem na hora, com o prompt de cada um.}',
      buttons: [{ title: 'Quero a lista', payload: 'quero_material_42' }],
      next: 'espera_toque',
    },
    // Sem esta parada o delay abaixo dispararia com a janela ainda fechada.
    espera_toque: { type: 'wait_reply', next: 'entrega' },
    entrega: {
      type: 'buttons',
      text:
        '{Tá aqui, {{nome}} 👇|Chegou 👇|É esse aqui, {{nome}} 👇} ' +
        '{Browser Use, Superpowers e Context7: como instalar e o prompt para usar cada um.|Os três repositórios, com a instalação no Claude Code e o prompt pronto de cada um.}',
      buttons: [{ title: 'Abrir o material', url: '{{presente}}' }],
      next: 'espera_5min',
    },
    espera_5min: { type: 'delay', seconds: 5 * 60, next: 'checagem' },
    // Sem botão: o run está `sleeping` aqui e toque não retomaria nada.
    checagem: {
      type: 'message',
      text:
        '{E aí {{nome}}, conseguiu abrir o material?|{{nome}}, deu certo abrir a lista?|Conseguiu acessar, {{nome}}?} ' +
        '{Começa pelo Superpowers: é o que mais muda o resultado no dia a dia. Qualquer dúvida, me responde aqui.|Qualquer coisa é só responder aqui que eu vejo.}',
      next: 'espera_1h',
    },
    espera_1h: { type: 'delay', seconds: 60 * 60, next: 'bonus' },
    bonus: {
      type: 'buttons',
      text:
        '{Aproveita que você tá com a lista na mão 👇|Se quiser mais repositório 👇|Mais uma pra você 👇} ' +
        '{Essa é a outra lista: três agentes open source para programar com o modelo que você quiser.|Deixo também a primeira lista de repositórios, com OpenCode e Goose.}',
      buttons: [{ title: 'Ver o material', url: BONUS_URL }],
      next: 'espera_1dia',
    },
    /** 19h: cabe no teto de 20h do bloco `delay` e fecha 20h05 dentro da janela. */
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
console.log('     inicio(botão) → espera toque → entrega /e/42 ({{presente}}) → 5 min → checagem → 1 h → material 31 → 19 h → grupo')
console.log('\nGATILHO')
console.log(`  ${APLICAR ? '→' : '·'} comment ["repo"] ${POST ? `no post ${POST}` : 'em QUALQUER post'}, contains, prioridade 20, ATIVO`)
console.log(`     resposta pública: ${RESPOSTA_PUBLICA}\n`)

if (!conta) {
  const { data: todas } = await supabaseAdmin.from('accounts').select('username')
  const nomes = ((todas ?? []) as { username: string }[]).map((c) => `@${c.username}`).join(', ') || 'nenhuma'
  console.error(`@${CONTA} não está conectada ao dm-flow (contas no banco: ${nomes}).`)
  console.error('Conecte pelo painel (dm.nocodepedro.site) ou passe --conta=<username>.')
  process.exit(APLICAR ? 1 : 0)
}

const MEDIA_ID = POST ? await mediaIdDoPost(conta.access_token, POST) : null
console.log(`conta @${conta.username}${APLICAR ? '' : '   (SIMULAÇÃO — nada será gravado)'}`)
console.log(`post   ${MEDIA_ID ? `${POST} → media ${MEDIA_ID}` : 'NENHUM — vale em qualquer post'}`)

if (!APLICAR) {
  console.log('\nSimulação. Rode de novo com --post=<código do reel> --aplicar para gravar.')
  process.exit(0)
}

if (!MEDIA_ID) {
  console.error('"repo" está dentro de "repositorio", a palavra do material 31: sem --post=<código do reel>, o material iria para quem comentou outro vídeo.')
  process.exit(1)
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
  console.error(`Entrega /e/${ENTREGA_SLUG} ${entrega ? 'em rascunho' : 'não existe'}: rode antes scripts/criar-entrega-42.mts --aplicar.`)
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
  keywords: ['repo'],
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

console.log(
  `\nPronto. A automação está ATIVA — comentário novo com "repo" ${MEDIA_ID ? 'no reel' : 'em qualquer post'} já entra no funil.`,
)
