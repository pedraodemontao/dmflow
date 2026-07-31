import { flowDefinitionSchema, type FlowDefinition, type FlowNode } from '@/lib/flow/types'

/**
 * De qual bloco veio o botão que a pessoa apertou.
 *
 * A Meta devolve só o `payload` — uma string autoral que o dono escreveu no
 * botão. Ela não diz de qual fluxo nem de qual nó aquele botão saiu, e o
 * webhook não carrega essa memória: entre o envio e o toque podem ter passado
 * horas, e a definição do fluxo pode ter mudado no meio. Então a origem é
 * reconstruída aqui, varrendo as definições da conta atrás de quem declara
 * aquele payload.
 *
 * Três lugares declaram botão com payload (ver `types.ts`):
 *   - `buttons`  → `buttons[]`
 *   - `message`  → `quickReplies[]`
 *   - `carousel` → `cards[].buttons[]`
 */

export interface ButtonSource {
  /** Nulo quando a origem é ambígua entre fluxos, ou não foi achada. */
  flowId: string | null
  /** Nulo quando a origem é ambígua entre blocos, ou não foi achada. */
  nodeId: string | null
  /** Rótulo copiado da definição no momento do clique. */
  title: string | null
}

/** O que uma definição precisa expor para ser varrida. `definition` vem crua do banco. */
export interface FlowDefinitionRow {
  id: string
  definition: unknown
}

interface Match {
  flowId: string
  nodeId: string
  title: string
}

/** Rótulos declarados para um payload dentro de um único nó. */
function titlesForPayload(node: FlowNode, payload: string): string[] {
  switch (node.type) {
    case 'buttons':
      return node.buttons.filter((button) => button.payload === payload).map((b) => b.title)
    case 'message':
      return (node.quickReplies ?? [])
        .filter((quickReply) => quickReply.payload === payload)
        .map((q) => q.title)
    case 'carousel':
      return node.cards.flatMap((card) =>
        (card.buttons ?? []).filter((button) => button.payload === payload).map((b) => b.title),
      )
    default:
      return []
  }
}

/**
 * Acha o botão que declara `payload` nas definições dadas.
 *
 * REGRA DO PAYLOAD AMBÍGUO — o payload é texto livre, então nada impede o dono
 * de usar `QUERO` em dois blocos (ou em dois fluxos). Quando isso acontece,
 * a origem é reduzida ao maior denominador comum honesto, nunca chutada:
 *
 *   - casou em blocos diferentes do MESMO fluxo → grava `flow_id`, `node_id` nulo;
 *   - casou em fluxos diferentes                → grava os dois nulos;
 *   - casou em nenhum lugar                     → grava os dois nulos.
 *
 * Escolher um dos candidatos "porque veio primeiro" seria pior que não saber:
 * inflaria um bloco e zeraria o outro, e a tela de métricas mentiria sem dar
 * nenhum sinal de que chutou. Nulo pelo menos se enxerga.
 *
 * O `title` sobrevive à ambiguidade quando todos os candidatos concordam no
 * rótulo: o texto do botão continua sendo um fato mesmo quando a procedência
 * não é. Discordando, vira nulo também.
 *
 * O clique nunca é descartado por não ter origem — quem chama grava a linha
 * de qualquer jeito. Botão apagado depois do envio e toque de ice breaker
 * (que não vem de bloco de fluxo) caem aqui o tempo todo e são normais.
 */
export function resolveButtonSource(flows: FlowDefinitionRow[], payload: string): ButtonSource {
  const matches: Match[] = []

  for (const flow of flows) {
    const parsed = flowDefinitionSchema.safeParse(flow.definition)
    if (!parsed.success) continue

    for (const [nodeId, node] of Object.entries(parsed.data.nodes)) {
      for (const title of titlesForPayload(node, payload)) {
        matches.push({ flowId: flow.id, nodeId, title })
      }
    }
  }

  if (matches.length === 0) return { flowId: null, nodeId: null, title: null }

  const titles = new Set(matches.map((match) => match.title))
  const title = titles.size === 1 ? matches[0].title : null

  const flowIds = new Set(matches.map((match) => match.flowId))
  if (flowIds.size > 1) return { flowId: null, nodeId: null, title }

  // Dois botões do mesmo nó com o mesmo payload não são ambiguidade de origem:
  // a procedência é a mesma, só a declaração está repetida.
  const nodeIds = new Set(matches.map((match) => match.nodeId))
  return {
    flowId: matches[0].flowId,
    nodeId: nodeIds.size === 1 ? matches[0].nodeId : null,
    title,
  }
}

export interface DeclaredButton {
  payload: string
  title: string
}

export interface ButtonNode {
  nodeId: string
  nodeType: FlowNode['type']
  buttons: DeclaredButton[]
}

/**
 * Todo bloco do fluxo que oferece botão com payload, na ordem em que os botões
 * aparecem na definição.
 *
 * A tela de métricas precisa disto para mostrar o botão que ninguém apertou:
 * contando só o que está em `button_clicks`, um botão com zero clique
 * simplesmente não existiria — e "ninguém escolheu esta opção" é exatamente o
 * dado que faz o dono trocar a oferta.
 *
 * Botão de link (`url` sem `payload`) fica de fora: ele abre o navegador sem
 * mandar nada de volta para a Meta, então clique nele é invisível para nós.
 */
export function listButtonNodes(definition: FlowDefinition): ButtonNode[] {
  const nodes: ButtonNode[] = []

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    let buttons: DeclaredButton[] = []

    if (node.type === 'buttons') {
      buttons = node.buttons.flatMap((button) =>
        button.payload ? [{ payload: button.payload, title: button.title }] : [],
      )
    } else if (node.type === 'message') {
      buttons = (node.quickReplies ?? []).map((quickReply) => ({
        payload: quickReply.payload,
        title: quickReply.title,
      }))
    } else if (node.type === 'carousel') {
      buttons = node.cards.flatMap((card) =>
        (card.buttons ?? []).flatMap((button) =>
          button.payload ? [{ payload: button.payload, title: button.title }] : [],
        ),
      )
    }

    if (buttons.length > 0) nodes.push({ nodeId, nodeType: node.type, buttons })
  }

  return nodes
}

/**
 * Traduz o TÍTULO de um botão de volta para o `payload` declarado.
 *
 * Existe porque a entrega por polling e a por webhook não são equivalentes. O
 * webhook manda `postback.payload` / `quick_reply.payload`; o polling lê
 * `/me/conversations`, onde o toque aparece como mensagem comum e o texto é o
 * TÍTULO do botão. Como o webhook nunca entregou nada neste projeto, na
 * prática o fluxo nunca vê o payload.
 *
 * Consequência sem esta função: quem escreve um botão com título "Quero sim" e
 * payload "SIM" e depois monta uma condição contra "SIM" pega o caminho errado
 * em silêncio — o fluxo compara "SIM" com "Quero sim" e cai no `senão`. As duas
 * automações em produção escapavam por acaso, porque o título continha o valor
 * procurado.
 *
 * Comparação sem diferenciar maiúscula e acento não entra aqui de propósito: o
 * título é declarado pelo próprio dono e chega de volta exatamente como saiu.
 * Igualdade exata evita traduzir por engano uma frase que a pessoa digitou.
 */
export function payloadForTitle(flows: FlowDefinitionRow[], text: string): string | null {
  const alvo = text.trim()
  if (!alvo) return null

  const encontrados = new Set<string>()

  for (const flow of flows) {
    const parsed = flowDefinitionSchema.safeParse(flow.definition)
    if (!parsed.success) continue

    for (const { buttons } of listButtonNodes(parsed.data)) {
      for (const botao of buttons) {
        if (botao.title === alvo) encontrados.add(botao.payload)
      }
    }
  }

  // Título repetido apontando para payloads diferentes: traduzir seria chutar,
  // e chutar aqui manda a pessoa para o galho errado do fluxo. Devolve nulo e
  // o texto original segue como veio.
  return encontrados.size === 1 ? [...encontrados][0] : null
}
