/**
 * Monta a automação do reel "vídeos 10/10" (material 52, reel DedBAiIqsKk de
 * 13/10/2026: Ryan Carson, AI Jason, IndyDevDan e Theo): fluxo com remarketing
 * e gatilho da palavra VÍDEO. O material é a entrega /e/52 do painel (mesmo
 * texto de nocodepedro.site/52).
 *
 *   ...scripts/criar-automacao-video-52.mts                      simula
 *   ...scripts/criar-automacao-video-52.mts --aplicar            grava, ATIVA e prende ao reel
 *   ...scripts/criar-automacao-video-52.mts --post=<código> ...  outro post (repost na conta nova)
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * Mesma estrutura do `criar-automacao-conector-51.mts` (postback → wait_reply →
 * link → 5 min → checagem → 1 h → bônus → 19 h → grupo); o porquê de cada
 * parada está no `criar-automacao-vibecoding.mts`.
 *
 * Gatilho: "video". O matcher é `contains` sem acento e sem caixa, então
 * "VÍDEO", "vídeo" e "video" batem igual — e também "que vídeo bom" e
 * "vídeos". Solto, dispararia em comentário de qualquer post; por isso nasce
 * PRESO ao reel (`DedBAiIqsKk`, padrão), e lá quem elogia o vídeo também
 * recebe a DM, o que é aceitável: é gente interessada no assunto. `--post=`
 * troca o código; não há jeito de aplicar solto, de propósito.
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
const POST = arg('post') ?? 'DedBAiIqsKk'

const FLUXO_NOME = 'Comentário VÍDEO → material 52'
/**
 * A entrega da aba Biblioteca → Entregas (`criar-entrega-52.mts`). O botão
 * leva `{{presente}}`, que o motor troca por /e/52?c=<token do contato>:
 * é isso que conta QUEM abriu, coisa que o link do site não conta.
 */
const ENTREGA_SLUG = '52'
/** O 51 são os 5 conectores do Claude Code: quem vai aplicar os vídeos no Claude Code é quem quer o próximo passo. */
const BONUS_URL = 'https://www.nocodepedro.site/51'
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
        '{Oi {{nome}}! Vi seu comentário 👋|Fala {{nome}}! Recebi seu comentário 👋|E aí {{nome}}, vi o VÍDEO ali 🎬} ' +
        '{Toca no botão que eu te mando o link dos 4 vídeos.|Aperta o botão aí embaixo que eu libero os 4 vídeos agora.|Clica no botão e os links vêm na hora, com o que aplicar de cada um.}',
      buttons: [{ title: 'Quero os vídeos', payload: 'quero_material_52' }],
      next: 'espera_toque',
    },
    // Sem esta parada o delay abaixo dispararia com a janela ainda fechada.
    espera_toque: { type: 'wait_reply', next: 'entrega' },
    entrega: {
      type: 'buttons',
      text:
        '{Tá aqui, {{nome}} 👇|Chegou 👇|É esse aqui, {{nome}} 👇} ' +
        '{Os 4 vídeos, os minutos que valem a pena e um arquivo pronto para aplicar cada um no Claude Code.|Ryan Carson, AI Jason, IndyDevDan e Theo, com o link que já abre no trecho certo.}',
      buttons: [{ title: 'Abrir o material', url: '{{presente}}' }],
      next: 'espera_5min',
    },
    espera_5min: { type: 'delay', seconds: 5 * 60, next: 'checagem' },
    // Sem botão: o run está `sleeping` aqui e toque não retomaria nada.
    checagem: {
      type: 'message',
      text:
        '{E aí {{nome}}, conseguiu abrir o material?|{{nome}}, deu certo abrir a página?|Conseguiu acessar, {{nome}}?} ' +
        '{Começa pelo vídeo do Ryan: são dois comandos para o Claude Code escrever o PRD antes do código. Qualquer dúvida, me responde aqui.|Qualquer coisa é só responder aqui que eu vejo.}',
      next: 'espera_1h',
    },
    espera_1h: { type: 'delay', seconds: 60 * 60, next: 'bonus' },
    bonus: {
      type: 'buttons',
      text:
        '{Aproveita que você tá nessa 👇|Próximo passo pro seu Claude Code 👇|Mais um pra você 👇} ' +
        '{São os 5 conectores que dão olhos e mãos ao Claude Code: pesquisa, navegador, analytics e seus apps.|Deixo também o material dos 5 conectores do Claude Code, com o comando de instalação de cada um.}',
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
console.log('     inicio(botão) → espera toque → entrega /e/52 ({{presente}}) → 5 min → checagem → 1 h → material 51 → 19 h → grupo')
console.log('\nGATILHO')
console.log(`  ${APLICAR ? '→' : '·'} comment ["video"] no post ${POST}, contains, prioridade 20, ATIVO`)
console.log(`     resposta pública: ${RESPOSTA_PUBLICA}\n`)

if (!conta) {
  const { data: todas } = await supabaseAdmin.from('accounts').select('username')
  const nomes = ((todas ?? []) as { username: string }[]).map((c) => `@${c.username}`).join(', ') || 'nenhuma'
  console.error(`@${CONTA} não está conectada ao dm-flow (contas no banco: ${nomes}).`)
  console.error('Conecte pelo painel (dm.nocodepedro.site) ou passe --conta=<username>.')
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
  console.error(`Entrega /e/${ENTREGA_SLUG} ${entrega ? 'em rascunho' : 'não existe'}: rode antes scripts/criar-entrega-52.mts --aplicar.`)
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
  keywords: ['video'],
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

console.log(`\nPronto. A automação está ATIVA — comentário novo com "video" no reel ${POST} já entra no funil.`)
