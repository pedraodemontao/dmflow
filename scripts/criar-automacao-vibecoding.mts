/**
 * Monta a automação do post de Vibe Coding (28/08) inteira: entrega, fluxo com
 * remarketing e gatilho preso àquele post.
 *
 *   ...scripts/criar-automacao-vibecoding.mts                      simula
 *   ...scripts/criar-automacao-vibecoding.mts --grupo=URL --aplicar grava e ATIVA
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * Script e não clique no painel porque são três tabelas que só fazem sentido
 * juntas: gatilho sem entrega publicada manda link vazio, entrega sem gatilho
 * não chega em ninguém. Idempotente pelo slug da entrega e pelo par
 * keyword+media do gatilho — rodar duas vezes não duplica.
 *
 * A JANELA DE 24H É QUEM DESENHA O FUNIL, não a preferência de cadência:
 *   - comentar NÃO abre a janela. Por isso o primeiro bloco é `buttons`: a
 *     private reply leva botão, o toque marca `last_inbound_at` e só aí a DM
 *     comum passa a ser possível. Sem o toque, todo o resto do funil bateria
 *     em "outside of allowed window" e mataria o run.
 *   - `wait_reply` logo depois é o que segura o fluxo até esse toque acontecer.
 *     Sem ele o `delay` de 5 min dispararia com a janela ainda fechada.
 *   - o convite do "1 dia depois" é 19h, não 24h. O schema do bloco `delay`
 *     para em 20h (`types.ts`) e a janela fecha em 24h contadas do toque:
 *     5min + 1h + 19h = 20h05 de folga dentro da janela. 24h cravado seria
 *     enviar exatamente no instante em que a Meta fecha a porta.
 */
import { checkFlowTexts, checkPublicReply } from '../src/lib/flow/variation'
import { flowDefinitionSchema, type FlowDefinition } from '../src/lib/flow/types'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const APLICAR = process.argv.includes('--aplicar')
const GRUPO = process.argv.find((a) => a.startsWith('--grupo='))?.slice('--grupo='.length)

/** O post de 28/08 ("Comenta 'vibecoding' que eu te mando um guia completo"). */
const MEDIA_ID = '18618622117034382'
const PERMALINK = 'https://www.instagram.com/reel/DckBZzXiMT4/'

/** A promessa da legenda é literal: guia completo para COMEÇAR. */
const ENTREGA_SLUG = 'guia-completo-para-comecar-no-vibe-coding-vc1x08'
const FLUXO_NOME = 'Comentário → Vibe Coding'

/**
 * O bônus de 1h aponta para uma entrega JÁ PUBLICADA, com link fixo. Só o
 * presente principal usa `{{presente}}` — a variável resolve a entrega
 * vinculada ao fluxo, e um fluxo tem uma só.
 */
const BONUS_URL = 'https://dm.nocodepedro.site/e/passo-a-passo-instalando-e-usando-o-claude-code-lhd9qp'

const ENTREGA = {
  title: 'Guia completo para começar no Vibe Coding',
  subtitle: 'Do zero ao primeiro sistema rodando — sem ser programador.',
  blocks: [
    {
      type: 'paragraph',
      text: 'Vibe Coding é construir software conversando com a IA em vez de digitar código. Você descreve o que quer, a IA escreve, você testa e corrige. O que você precisa aprender não é sintaxe: é pedir direito, olhar o resultado e mandar ajustar.',
    },
    {
      type: 'callout',
      text: 'Leia isto antes de escolher ferramenta: quem trava não trava por falta de ferramenta, trava por começar grande. O primeiro projeto tem que ser pequeno o bastante para ficar pronto hoje.',
    },
    { type: 'heading', text: 'As ferramentas, e para que serve cada uma' },
    {
      type: 'list',
      items: [
        'Lovable — do zero ao app no ar pelo navegador. É onde começar se você nunca abriu um editor de código.',
        'Claude Code — roda no terminal, mexe no projeto inteiro. É onde você vai parar quando o projeto crescer.',
        'Cursor — editor de código com IA dentro. O meio do caminho entre os dois.',
        'Supabase — banco de dados e login prontos. Todo sistema de verdade precisa guardar dados em algum lugar.',
        'Vercel — publica o que você construiu numa URL. De graça até o projeto ficar grande.',
      ],
    },
    { type: 'heading', text: 'O caminho, na ordem' },
    {
      type: 'steps',
      items: [
        {
          title: 'Escolha um problema chato e pequeno',
          text: 'Nada de "um app tipo Uber". Pegue algo que você faz na mão toda semana: uma planilha de orçamento, um controle de clientes, um formulário que hoje vive no WhatsApp. Problema pequeno é o que fecha o primeiro ciclo.',
        },
        {
          title: 'Descreva antes de pedir',
          text: 'Escreva em três linhas: quem usa, o que a pessoa faz na tela, o que precisa ficar salvo. A IA acerta na proporção da clareza do pedido — pedido vago devolve tela bonita que não faz nada.',
        },
        {
          title: 'Construa a primeira tela e só ela',
          text: 'Abra o Lovable, cole a descrição, deixe gerar. Não peça mais nada enquanto a primeira tela não estiver funcionando. Cada pedido novo em cima de coisa quebrada empilha erro.',
        },
        {
          title: 'Ligue o banco',
          text: 'Conecte o Supabase e faça o sistema salvar de verdade. Aqui é onde o brinquedo vira ferramenta: enquanto os dados somem ao recarregar a página, você tem uma maquete.',
        },
        {
          title: 'Publique',
          text: 'Suba na Vercel e mande o link para uma pessoa usar. Sistema que só roda na sua máquina não recebe crítica, e crítica é o que faz a segunda versão prestar.',
        },
        {
          title: 'Corrija em ciclos curtos',
          text: 'Peça uma mudança por vez, teste, siga. Quando você pede cinco coisas juntas e quebra, não dá para saber qual delas quebrou.',
        },
      ],
    },
    { type: 'heading', text: 'Antes de dizer que está pronto' },
    {
      type: 'checklist',
      items: [
        'Consigo abrir o sistema numa URL pública, sem rodar nada na minha máquina.',
        'O que eu salvo continua lá depois de recarregar a página.',
        'Uma pessoa que não sou eu conseguiu usar sem eu explicar.',
        'Nenhuma senha ou chave está escrita dentro do código.',
        'Eu sei dizer, em uma frase, que problema esse sistema resolve.',
      ],
    },
    { type: 'heading', text: 'Onde isso vira dinheiro' },
    {
      type: 'paragraph',
      text: 'O primeiro projeto pago quase nunca é um produto seu: é o processo manual de alguém que você conhece. Procure quem controla o negócio por planilha e grupo de WhatsApp, entregue a versão pequena que resolve uma dor só, e cobre pelo tempo que a pessoa deixa de perder — não pelas horas que você gastou.',
    },
    {
      type: 'quote',
      text: 'Não é sobre saber programar. É sobre entregar antes de estar confiante.',
    },
  ],
} as const

const remarketing = {
  checagem: 5 * 60,
  bonus: 60 * 60,
  /** 19h: cabe no teto de 20h do bloco `delay` e fecha 20h05 dentro da janela. */
  convite: 19 * 60 * 60,
}

const RESPOSTA_PUBLICA =
  '{Mandei no seu direct! 📩|Chegou no privado ✨|Te respondi no direct 😉|Corre no direct que tá lá 👀}'

function definicao(grupoUrl: string): FlowDefinition {
  return {
    entry: 'inicio',
    nodes: {
      // Private reply COM BOTÃO: é o toque nele que abre a janela de 24h.
      inicio: {
        type: 'buttons',
        text:
          '{Oi {{nome}}! Vi seu comentário 👋|E aí {{nome}}, chegou seu comentário 👋|Fala {{nome}}! Vi que você comentou 👋} ' +
          '{Toca no botão que eu te mando o guia completo de Vibe Coding.|Aperta o botão aí embaixo que eu libero o guia agora.|Clica no botão e o guia vem na hora.}',
        buttons: [{ title: 'Quero o guia', payload: 'quero_guia_vibecoding' }],
        next: 'espera_toque',
      },
      // Sem esta parada o delay abaixo dispararia com a janela ainda fechada.
      espera_toque: { type: 'wait_reply', next: 'entrega' },
      entrega: {
        type: 'buttons',
        text:
          '{Tá aqui, {{nome}} 👇|Chegou 👇|É esse aqui, {{nome}} 👇} ' +
          '{O guia completo pra começar no Vibe Coding — do zero ao primeiro sistema no ar.|Guia completo de Vibe Coding: o caminho do zero até publicar o primeiro sistema.}',
        buttons: [{ title: 'Abrir o guia', url: '{{presente}}' }],
        next: 'espera_5min',
      },
      espera_5min: { type: 'delay', seconds: remarketing.checagem, next: 'checagem' },
      /**
       * Sem botão de propósito: um toque aqui não retomaria nada (o run está
       * `sleeping`, e só `waiting_reply` é retomado por resposta — ver
       * `process.ts`), então o botão seria clique no vazio. Resposta em texto
       * cai no inbox, onde dá para atender de verdade.
       */
      checagem: {
        type: 'message',
        text:
          '{E aí {{nome}}, conseguiu abrir o guia?|{{nome}}, deu certo abrir o material?|Conseguiu acessar o guia, {{nome}}?} ' +
          '{Se travou em alguma parte, me responde aqui que eu te ajudo.|Qualquer coisa é só responder aqui que eu vejo.}',
        next: 'espera_1h',
      },
      espera_1h: { type: 'delay', seconds: remarketing.bonus, next: 'bonus' },
      bonus: {
        type: 'buttons',
        text:
          '{Aproveita que você tá começando 👇|Já que você tá nessa 👇|Mais uma pra você 👇} ' +
          '{Esse é o passo a passo de instalar e usar o Claude Code, a ferramenta que eu uso pra construir.|Deixo de graça o passo a passo do Claude Code, que é onde eu construo os sistemas.}',
        buttons: [{ title: 'Ver o passo a passo', url: BONUS_URL }],
        next: 'espera_1dia',
      },
      espera_1dia: { type: 'delay', seconds: remarketing.convite, next: 'convite' },
      convite: {
        type: 'buttons',
        text:
          '{Última coisa, {{nome}} 👇|Pra fechar, {{nome}} 👇|Fecho com essa 👇} ' +
          '{Abri um grupo de quem tá construindo com IA — é lá que eu solto primeiro o que funciona.|Tenho um grupo de quem tá construindo com IA; o que dá certo aparece lá antes.}',
        buttons: [{ title: 'Entrar no grupo', url: grupoUrl }],
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
}

// ---------------------------------------------------------------------------
// Validação antes de qualquer escrita: o que o painel recusaria, o script
// também recusa. Fluxo gravado por fora que não passa no schema quebra o
// engine no meio do run, que é onde ninguém vê.
// ---------------------------------------------------------------------------
if (!GRUPO) {
  console.log('Sem --grupo=<link do grupo>: simulando com um link de exemplo.\n')
}
const def = definicao(GRUPO ?? 'https://chat.whatsapp.com/EXEMPLO')

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

const { data: contaRow } = await supabaseAdmin
  .from('accounts')
  .select('id, username')
  .order('created_at')
  .limit(1)
  .single()
const conta = contaRow as { id: string; username: string }

console.log(`conta @${conta.username}${APLICAR ? '' : '   (SIMULAÇÃO — nada será gravado)'}`)
console.log(`post   ${PERMALINK}  (${MEDIA_ID})\n`)

// ---------------------------------------------------------------------------
// 1. Entrega — publicada de saída. Rascunho faria `{{presente}}` mandar um
//    link que a rota pública recusa (`/e/[slug]` só serve 'published').
// ---------------------------------------------------------------------------
const { data: entregaExistente } = await supabaseAdmin
  .from('deliveries')
  .select('id, status')
  .eq('slug', ENTREGA_SLUG)
  .maybeSingle()

let entregaId = (entregaExistente as { id: string } | null)?.id ?? null
console.log('ENTREGA')
if (entregaId) {
  console.log(`  · já existe /${ENTREGA_SLUG} — nada a fazer`)
} else {
  console.log(`  ${APLICAR ? '→' : '·'} criar "${ENTREGA.title}" em /${ENTREGA_SLUG} (published)`)
  console.log(`     ${ENTREGA.blocks.length} blocos`)
  if (APLICAR) {
    const { data, error } = await supabaseAdmin
      .from('deliveries')
      .insert({
        account_id: conta.id,
        slug: ENTREGA_SLUG,
        title: ENTREGA.title,
        subtitle: ENTREGA.subtitle,
        blocks: ENTREGA.blocks,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error) throw new Error(`entrega não gravada: ${error.message}`)
    entregaId = (data as { id: string }).id
  }
}

// ---------------------------------------------------------------------------
// 2. Fluxo
// ---------------------------------------------------------------------------
const { data: fluxoExistente } = await supabaseAdmin
  .from('flows')
  .select('id')
  .eq('account_id', conta.id)
  .eq('name', FLUXO_NOME)
  .maybeSingle()

let fluxoId = (fluxoExistente as { id: string } | null)?.id ?? null
console.log('\nFLUXO')
console.log(`  ${APLICAR ? '→' : '·'} ${fluxoId ? 'atualizar' : 'criar'} "${FLUXO_NOME}"`)
console.log(
  `     inicio(botão) → espera toque → entrega({{presente}}) → 5 min → checagem → 1 h → bônus → 19 h → convite`,
)
if (APLICAR) {
  if (fluxoId) {
    const { error } = await supabaseAdmin
      .from('flows')
      .update({ definition: def, delivery_id: entregaId, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', fluxoId)
    if (error) throw new Error(`fluxo não atualizado: ${error.message}`)
  } else {
    const { data, error } = await supabaseAdmin
      .from('flows')
      .insert({
        account_id: conta.id,
        name: FLUXO_NOME,
        definition: def,
        delivery_id: entregaId,
        is_active: true,
      })
      .select('id')
      .single()
    if (error) throw new Error(`fluxo não gravado: ${error.message}`)
    fluxoId = (data as { id: string }).id
  }
}

// ---------------------------------------------------------------------------
// 3. Gatilho — preso ao post. Palavra sem `media_id` responderia comentário de
//    post antigo também; presa ao post errado, fica muda sem erro nenhum.
// ---------------------------------------------------------------------------
console.log('\nGATILHO')
console.log(`  ${APLICAR ? '→' : '·'} comment ["vibecoding","vibe coding"] no post ${MEDIA_ID}, contains, ATIVO`)
console.log(`     resposta pública: ${RESPOSTA_PUBLICA}`)
if (APLICAR) {
  const { data: gatilhoExistente } = await supabaseAdmin
    .from('triggers')
    .select('id')
    .eq('account_id', conta.id)
    .eq('media_id', MEDIA_ID)
    .maybeSingle()

  const payload = {
    account_id: conta.id,
    flow_id: fluxoId,
    type: 'comment',
    keywords: ['vibecoding', 'vibe coding'],
    match_mode: 'contains',
    media_id: MEDIA_ID,
    public_reply: RESPOSTA_PUBLICA,
    is_active: true,
  }

  const { error } = gatilhoExistente
    ? await supabaseAdmin.from('triggers').update(payload).eq('id', (gatilhoExistente as { id: string }).id)
    : await supabaseAdmin.from('triggers').insert(payload)
  if (error) throw new Error(`gatilho não gravado: ${error.message}`)
}

console.log(
  APLICAR
    ? '\nPronto. A automação está ATIVA — comentário novo com "vibecoding" naquele post já entra no funil.'
    : '\nSimulação. Rode de novo com --grupo=<link> --aplicar para gravar.',
)
