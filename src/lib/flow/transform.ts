import type { Edge, Node } from '@xyflow/react'

import type { FlowDefinition, FlowNode } from '@/lib/flow/types'

const COL = 320
const ROW = 200

/**
 * Dispõe os nós em camadas seguindo as conexões, para um fluxo recém-importado
 * (ou criado) já abrir organizado em vez de tudo empilhado na origem.
 */
function autoLayout(definition: FlowDefinition): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  const depthOf = new Map<string, number>()
  const queue: Array<{ id: string; depth: number }> = [{ id: definition.entry, depth: 0 }]

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    if (depthOf.has(id) || !definition.nodes[id]) continue
    depthOf.set(id, depth)
    for (const next of outgoing(definition.nodes[id])) {
      if (next) queue.push({ id: next, depth: depth + 1 })
    }
  }

  // Nós órfãos (ainda não conectados) vão para uma coluna à direita.
  const orphans = Object.keys(definition.nodes).filter((id) => !depthOf.has(id))
  const maxDepth = Math.max(0, ...depthOf.values())
  orphans.forEach((id, i) => depthOf.set(id, maxDepth + 1 + i))

  const perDepth = new Map<number, number>()
  for (const [id, depth] of depthOf) {
    const index = perDepth.get(depth) ?? 0
    perDepth.set(depth, index + 1)
    positions[id] = { x: index * COL, y: depth * ROW }
  }

  return positions
}

function outgoing(node: FlowNode): Array<string | null | undefined> {
  if (node.type === 'condition') return [...node.cases.map((c) => c.next), node.fallback]
  if (node.type === 'randomize') return node.paths.map((p) => p.next)
  // `end` termina o fluxo; `goto_flow` termina o caminho atual e continua em
  // outra definição — nenhum dos dois tem aresta de saída no canvas.
  if (node.type === 'end' || node.type === 'goto_flow') return []
  return [node.next]
}

export function definitionToGraph(definition: FlowDefinition): { nodes: Node[]; edges: Edge[] } {
  const layout = definition.layout ?? autoLayout(definition)

  const nodes: Node[] = Object.entries(definition.nodes).map(([id, node]) => ({
    id,
    type: 'builder',
    position: layout[id] ?? { x: 0, y: 0 },
    data: { ...node, isEntry: id === definition.entry } as unknown as Record<string, unknown>,
  }))

  const edges: Edge[] = []
  for (const [id, node] of Object.entries(definition.nodes)) {
    if (node.type === 'condition') {
      node.cases.forEach((branch, i) => {
        if (branch.next) {
          edges.push({
            id: `${id}-case-${i}`,
            source: id,
            sourceHandle: `case-${i}`,
            target: branch.next,
            label: branch.value || branch.op,
          })
        }
      })
      if (node.fallback) {
        edges.push({
          id: `${id}-fallback`,
          source: id,
          sourceHandle: 'fallback',
          target: node.fallback,
          label: 'senão',
        })
      }
    } else if (node.type === 'randomize') {
      node.paths.forEach((path, i) => {
        if (path.next) {
          edges.push({
            id: `${id}-path-${i}`,
            source: id,
            sourceHandle: `path-${i}`,
            target: path.next,
            label: path.label,
          })
        }
      })
    } else if (node.type !== 'end' && node.type !== 'goto_flow' && node.next) {
      edges.push({ id: `${id}-next`, source: id, target: node.next })
    }
  }

  return { nodes, edges }
}

/**
 * Caminho inverso: o canvas é a fonte da verdade, então as conexões desenhadas
 * sobrescrevem os `next` guardados em cada nó.
 */
export function graphToDefinition(nodes: Node[], edges: Edge[], entry: string): FlowDefinition {
  const result: FlowDefinition = { entry, nodes: {}, layout: {} }

  for (const node of nodes) {
    const raw = { ...(node.data as unknown as FlowNode & { isEntry?: boolean }) }
    delete raw.isEntry
    const clean = structuredClone(raw) as FlowNode

    if (clean.type === 'condition') {
      clean.cases = clean.cases.map((branch, i) => ({
        ...branch,
        next: edges.find((e) => e.source === node.id && e.sourceHandle === `case-${i}`)?.target ?? null,
      }))
      clean.fallback =
        edges.find((e) => e.source === node.id && e.sourceHandle === 'fallback')?.target ?? null
    } else if (clean.type === 'randomize') {
      clean.paths = clean.paths.map((path, i) => ({
        ...path,
        next: edges.find((e) => e.source === node.id && e.sourceHandle === `path-${i}`)?.target ?? null,
      }))
    } else if (clean.type !== 'end' && clean.type !== 'goto_flow') {
      clean.next = edges.find((e) => e.source === node.id && !e.sourceHandle)?.target ?? null
    }

    result.nodes[node.id] = clean
    result.layout![node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) }
  }

  return result
}

export function emptyDefinition(): FlowDefinition {
  return {
    entry: 'inicio',
    nodes: {
      inicio: {
        type: 'message',
        text: 'Oi {{nome}}! Vi que você comentou 👋',
        next: null,
      },
    },
    layout: { inicio: { x: 0, y: 0 } },
  }
}

export function blankNode(type: FlowNode['type']): FlowNode {
  switch (type) {
    case 'message':
      return { type: 'message', text: 'Escreva sua mensagem aqui', next: null }
    case 'buttons':
      return {
        type: 'buttons',
        text: 'Escolha uma opção:',
        buttons: [{ title: 'Quero saber mais' }],
        next: null,
      }
    case 'carousel':
      return {
        type: 'carousel',
        cards: [{ title: 'Primeiro card', subtitle: 'Descrição rápida' }],
        next: null,
      }
    case 'bubbles':
      return {
        type: 'bubbles',
        bubbles: [{ text: 'Oi! Vi seu comentário 👋' }, { text: 'Já te conto como funciona...' }],
        pauseMs: 1200,
        next: null,
      }
    case 'goto_flow':
      return { type: 'goto_flow', flowId: '' }
    case 'image':
      return { type: 'image', url: 'https://', next: null }
    case 'video':
      return { type: 'video', url: 'https://', next: null }
    case 'audio':
      return { type: 'audio', url: 'https://', next: null }
    case 'file':
      return { type: 'file', url: 'https://', next: null }
    case 'ask':
      return {
        type: 'ask',
        text: 'Qual é o seu melhor e-mail?',
        saveAs: 'email',
        expect: 'email',
        maxRetries: 2,
        next: null,
      }
    case 'set_field':
      return { type: 'set_field', fields: [{ key: 'origem', value: 'instagram' }], next: null }
    case 'randomize':
      return {
        type: 'randomize',
        paths: [
          { label: 'A', next: null },
          { label: 'B', next: null },
        ],
      }
    case 'unsubscribe':
      return { type: 'unsubscribe', next: null }
    case 'wait_reply':
      return { type: 'wait_reply', saveAs: 'resposta', next: null }
    case 'condition':
      return {
        type: 'condition',
        cases: [{ source: 'last_input', op: 'contains', value: 'sim', next: null }],
        fallback: null,
      }
    case 'delay':
      return { type: 'delay', seconds: 3600, next: null }
    case 'tag':
      return { type: 'tag', add: ['lead'], next: null }
    case 'http':
      return { type: 'http', url: 'https://', method: 'POST', next: null }
    case 'end':
      return { type: 'end' }
  }
}
