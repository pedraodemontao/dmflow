/**
 * Monta a automação do post "Claude Code vs Codex" (30/08) inteira: entrega,
 * fluxo com remarketing e gatilho preso àquele post.
 *
 *   ...scripts/criar-automacao-codex.mts             simula
 *   ...scripts/criar-automacao-codex.mts --aplicar   grava e ATIVA
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * Modelado em `criar-automacao-vibecoding.mts` — o porquê de cada decisão de
 * estrutura (janela de 24h, wait_reply, 19h e não 24h) está lá e vale aqui.
 *
 * A PROMESSA DA LEGENDA É LITERAL: "o comparativo completo + o prompt exato
 * que usei nos dois". O prompt só o dono tem — o script RECUSA `--aplicar`
 * enquanto `O_PROMPT_EXATO` estiver com o marcador, porque publicar a entrega
 * sem ele é entregar menos do que o vídeo prometeu.
 */
import { checkFlowTexts, checkPublicReply } from '../src/lib/flow/variation'
import { flowDefinitionSchema, type FlowDefinition } from '../src/lib/flow/types'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const APLICAR = process.argv.includes('--aplicar')

/** O post de 30/08 ("Comenta CODEX que eu te mando o comparativo completo + o prompt exato"). */
const MEDIA_ID = '18198038236335725'
const PERMALINK = 'https://www.instagram.com/reel/Dcrwmp3iebA/'

const ENTREGA_SLUG = 'claude-code-vs-codex-o-comparativo-completo-cdx3k9'
const FLUXO_NOME = 'Comentário → Codex vs Claude Code'

/** ⚠️ COLE AQUI o prompt que rodou nos dois. O script não aplica com o marcador. */
const O_PROMPT_EXATO = `Atue como especialista sênior em UX/UI, copy de resposta direta e páginas de vendas mobile-first.

Crie uma página de vendas completa em italiano para o InventoKids, um produto digital de €16 destinado a crianças de 5 a 12 anos.

O produto entrega:

• Mais de 100 projetos de robótica em vídeo
• Explicações passo a passo
• Projetos do nível mais simples ao avançado
• Acesso digital imediato e vitalício
• Atualizações incluídas
• Atividades que podem ser realizadas em família

BIG IDEA

A criança pode construir alguma coisa com as próprias mãos e ver aquilo funcionar de verdade.

Hierarquia da promessa:

1. Construção é a promessa principal
2. De consumidor para criador e pequeno inventor é a transformação
3. Menos tempo passivo nas telas é uma consequência

Não apresente o produto como um curso escolar, uma coleção de arquivos ou uma metodologia inventada.

DIREÇÃO VISUAL

Use a identidade visual do InventoKids:

• Teal escuro e verde oficina
• Laranja forte nos CTAs
• Creme e kraft nos fundos
• Amarelo como cor de apoio
• Elementos inspirados em papelão, oficina doméstica e desenhos técnicos
• Bordas arredondadas, sombras suaves e bastante profundidade visual

Utilize fotos reais e convincentes de crianças e famílias construindo projetos com:

• Papelão
• Tampinhas
• Palitos
• Elásticos
• Pequenos motores
• LEDs
• Fios e baterias simples

Não utilize robôs futuristas, kits prontos, laboratórios tecnológicos ou imagens genéricas que contradigam o produto.

HERO

Linha superior:

“Per bambini dai 5 ai 12 anni • Nessuna esperienza necessaria”

Headline com no máximo duas frases:

“Questo sabato tuo figlio può costruire il suo primo robot. E vederlo funzionare davvero.”

Subheadline curta:

“Oltre 100 progetti in video, spiegati passo dopo passo con materiali semplici e facili da trovare.”

CTA:

“Voglio iniziare il primo progetto”

Coloque o CTA antes do vídeo no mobile.

Depois do hero, mostrar:

• VSL vertical
• Acesso imediato
• Conteúdo vitalício
• Atualizações incluídas
• Garantia de 7 dias

ESTRUTURA DA PÁGINA

1. Hero com headline, subheadline, CTA e imagem ou VSL
2. Cards mostrando as dores reais das famílias
3. Seção “Non è da guardare. È da costruire.”
4. Transformação de consumidor para pequeno inventor
5. Menos tempo passivo diante das telas
6. Quebra da objeção “Non so nulla di robotica”
7. Explicação simples de como começar
8. Galeria de projetos reais
9. Benefícios: lógica, criatividade, concentração e autonomia
10. Momentos em família
11. Para quem é e para quem não é
12. Apresentação dos mais de 100 projetos
13. Provas sociais reais com fotos e avaliações em italiano
14. Oferta completa e mockup do produto
15. Preço de €16
16. Garantia de 7 dias
17. FAQ curta
18. Fechamento emocional e CTA final

COPY

Use italiano natural, curto e humano.

Evite:

• Travessões
• Parágrafos longos
• Repetições
• Frases genéricas de IA
• Linguagem excessivamente escolar
• Promessas exageradas
• Escassez falsa
• Contadores que reiniciam
• Depoimentos inventados
• Números de clientes sem comprovação

Não diga que todos os materiais já estão em casa. Alguns projetos podem utilizar motores e LEDs.

Use:

“Materiali semplici e facili da trovare.”

A página deve conversar com pais, mães, avós, familiares e educadores. Não escreva exclusivamente para o pai.

MOBILE

A maior parte do tráfego será mobile.

Priorize:

• CTA visível na primeira tela
• Tipografia grande e legível
• Textos curtos
• Cards compactos
• Imagens com proporção consistente
• Seções com ritmo visual
• Botões com pelo menos 48px de altura
• Oferta e preço fáceis de entender
• Animações suaves ao entrar na tela
• Boa performance e carregamento rápido

OFERTA

Recapitule antes de apresentar o preço:

• Um projeto para começar
• Mais de 100 para continuar
• Vídeos passo a passo
• Materiais simples
• Acesso vitalício
• Atualizações incluídas

Preço final:

€16

CTA:

“Voglio iniziare il primo progetto”

Feche retomando a transformação:

“Un progetto per iniziare. Più di 100 per continuare.”`

/** Bônus de 1h: entrega já publicada, link fixo (mesma regra do vibecoding). */
const BONUS_URL = 'https://dm.nocodepedro.site/e/guia-completo-para-comecar-no-vibe-coding-vc1x08'
/** O mesmo grupo do fluxo de vibecoding (lido do fluxo em produção em 30/08). */
const GRUPO_URL = 'https://chat.whatsapp.com/CSkDAbCjNqF8RwjT82f4fU'

/**
 * O conteúdo afirma só o que a legenda afirma — veredito, a virada do Codex na
 * geração de imagem, a dúvida — mais o roteiro de reproduzir o teste. Nada de
 * número ou resultado que o vídeo não disse.
 */
const ENTREGA = {
  title: 'Claude Code vs Codex: o comparativo completo',
  subtitle: 'A mesma página, o mesmo prompt, as duas ferramentas — e quando usar cada uma.',
  blocks: [
    {
      type: 'paragraph',
      text: 'O teste foi simples de propósito: o MESMO prompt, colado nas duas ferramentas, pedindo a mesma página. Sem ajuste no meio, sem segunda chance — o que saiu de primeira é o que conta aqui.',
    },
    { type: 'heading', text: 'O prompt exato' },
    {
      type: 'callout',
      text: 'Copia e cola como está. O resultado do teste só é comparável se o pedido for idêntico — mudou uma linha, mudou o teste.',
    },
    { type: 'quote', text: O_PROMPT_EXATO },
    { type: 'heading', text: 'O que cada um entregou' },
    {
      type: 'list',
      items: [
        'Claude Code — constrói página muito bem, e segue sendo a ferramenta principal: ele enxerga o projeto inteiro pelo terminal, então a página nasce já encaixada no resto do sistema.',
        'Codex — com a atualização nova de geração de imagem, o resultado VISUAL subiu de nível. Foi a primeira vez que a escolha ficou em dúvida.',
      ],
    },
    { type: 'heading', text: 'Quando usar cada um' },
    {
      type: 'steps',
      items: [
        {
          title: 'Página solta, visual mandando',
          text: 'Landing page, página de captura, algo que vive do impacto visual e não conversa com um sistema por trás: roda o prompt no Codex primeiro e veja se o resultado já resolve.',
        },
        {
          title: 'Página dentro de um projeto',
          text: 'Se a página precisa falar com banco, login ou o resto do código, Claude Code — ele lê os arquivos reais do projeto e constrói em cima do que existe, não do zero.',
        },
        {
          title: 'Na dúvida, rode nos dois',
          text: 'O prompt é o mesmo. Colar duas vezes custa minutos, e comparar o resultado com os próprios olhos vale mais que qualquer veredito — inclusive o meu.',
        },
      ],
    },
    {
      type: 'checklist',
      items: [
        'Colei o prompt SEM editar nas duas ferramentas.',
        'Comparei o visual lado a lado, no celular — é onde a página vai ser vista.',
        'Testei os botões e links da página gerada, não só olhei o print.',
        'Escolhi pela página que resolve o MEU caso, não pela mais bonita no print.',
      ],
    },
    {
      type: 'quote',
      text: 'Ferramenta boa é a que te deixa em dúvida. Ruim é a que você defende sem testar.',
    },
  ],
} as const

const remarketing = {
  checagem: 5 * 60,
  bonus: 60 * 60,
  /** 19h: teto de 20h do bloco `delay`, e fecha 20h05 dentro da janela de 24h. */
  convite: 19 * 60 * 60,
}

/** Variantes próprias — repetir as do vibecoding recriaria o padrão que o filtro pune. */
const RESPOSTA_PUBLICA =
  '{Acabei de mandar no seu direct 📩|Tá no seu privado ✨|Te mandei o comparativo no direct 😉|Dá uma olhada no direct 👀}'

const def: FlowDefinition = {
  entry: 'inicio',
  nodes: {
    // Private reply COM BOTÃO: é o toque que abre a janela de 24h.
    inicio: {
      type: 'buttons',
      text:
        '{Oi {{nome}}! Vi seu comentário 👋|Fala {{nome}}! Chegou seu comentário 👋|E aí {{nome}}, vi o CODEX ali 👋} ' +
        '{Toca no botão que eu te mando o comparativo completo + o prompt exato.|Aperta o botão aí embaixo que eu libero o comparativo e o prompt agora.|Clica no botão e o comparativo vem na hora, com o prompt junto.}',
      buttons: [{ title: 'Quero o comparativo', payload: 'quero_comparativo_codex' }],
      next: 'espera_toque',
    },
    espera_toque: { type: 'wait_reply', next: 'entrega' },
    entrega: {
      type: 'buttons',
      text:
        '{Tá aqui, {{nome}} 👇|Chegou 👇|É esse aqui, {{nome}} 👇} ' +
        '{Claude Code vs Codex, com o prompt exato que rodou nos dois.|O comparativo completo — e o prompt está lá dentro, pra você copiar.}',
      buttons: [{ title: 'Abrir o comparativo', url: '{{presente}}' }],
      next: 'espera_5min',
    },
    espera_5min: { type: 'delay', seconds: remarketing.checagem, next: 'checagem' },
    // Sem botão de propósito: run dormindo não retoma por toque; resposta em texto cai no inbox.
    checagem: {
      type: 'message',
      text:
        '{E aí {{nome}}, conseguiu abrir o comparativo?|{{nome}}, deu certo abrir o material?|Conseguiu acessar, {{nome}}?} ' +
        '{Se o prompt travar em alguma das duas ferramentas, me responde aqui que eu te ajudo.|Qualquer coisa é só responder aqui que eu vejo.}',
      next: 'espera_1h',
    },
    espera_1h: { type: 'delay', seconds: remarketing.bonus, next: 'bonus' },
    bonus: {
      type: 'buttons',
      text:
        '{Aproveita que você tá testando ferramenta 👇|Já que você tá nessa de construir com IA 👇|Mais uma pra você 👇} ' +
        '{Esse é o guia completo pra começar no Vibe Coding — do zero ao primeiro sistema no ar.|Deixo de graça o guia de Vibe Coding: o caminho inteiro, do zero até publicar.}',
      buttons: [{ title: 'Ver o guia', url: BONUS_URL }],
      next: 'espera_1dia',
    },
    espera_1dia: { type: 'delay', seconds: remarketing.convite, next: 'convite' },
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
// Validação antes de qualquer escrita — o que o painel recusaria, aqui recusa.
// ---------------------------------------------------------------------------
if (APLICAR && O_PROMPT_EXATO.includes('COLE_AQUI')) {
  console.error('O prompt exato ainda não foi colado (O_PROMPT_EXATO no topo do arquivo).')
  console.error('A legenda promete o prompt; publicar sem ele é entregar menos do que o vídeo disse.')
  process.exit(1)
}

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

// 1. Entrega — publicada de saída (rascunho faria {{presente}} mandar link que a rota recusa).
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
  console.log(`  ${APLICAR ? '→' : '·'} criar "${ENTREGA.title}" em /${ENTREGA_SLUG} (published), ${ENTREGA.blocks.length} blocos`)
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

// 2. Fluxo
const { data: fluxoExistente } = await supabaseAdmin
  .from('flows')
  .select('id')
  .eq('account_id', conta.id)
  .eq('name', FLUXO_NOME)
  .maybeSingle()

let fluxoId = (fluxoExistente as { id: string } | null)?.id ?? null
console.log('\nFLUXO')
console.log(`  ${APLICAR ? '→' : '·'} ${fluxoId ? 'atualizar' : 'criar'} "${FLUXO_NOME}"`)
console.log('     inicio(botão) → espera toque → entrega({{presente}}) → 5 min → checagem → 1 h → bônus → 19 h → convite')
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
      .insert({ account_id: conta.id, name: FLUXO_NOME, definition: def, delivery_id: entregaId, is_active: true })
      .select('id')
      .single()
    if (error) throw new Error(`fluxo não gravado: ${error.message}`)
    fluxoId = (data as { id: string }).id
  }
}

// 3. Gatilho — preso ao post (idempotente pelo par media_id+conta).
console.log('\nGATILHO')
console.log(`  ${APLICAR ? '→' : '·'} comment ["codex"] no post ${MEDIA_ID}, contains, ATIVO`)
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
    keywords: ['codex'],
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
    ? '\nPronto. A automação está ATIVA — comentário novo com "codex" naquele post já entra no funil.'
    : '\nSimulação. Cole o prompt em O_PROMPT_EXATO e rode com --aplicar para gravar.',
)
