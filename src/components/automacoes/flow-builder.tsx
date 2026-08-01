'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import { Plus } from 'lucide-react'

import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  NODE_CHIP,
  NODE_META,
  nodeGlyph,
  nodeTypes,
} from '@/components/automacoes/flow-nodes'
import { NodeInspector } from '@/components/automacoes/node-inspector'
import { Button } from '@/components/ui'
import type { FlowOption } from '@/lib/data'
import { findLeaks } from '@/lib/flow/leaks'
import { blankNode, definitionToGraph, graphToDefinition } from '@/lib/flow/transform'
import type { FlowDefinition, FlowNode } from '@/lib/flow/types'
import { cn } from '@/lib/utils'

/** O fio de cabelo (`--line-700`) em literal. A aresta é desenhada por
 *  `.react-flow__edge-path` no globals.css, mas a ponta de seta vira um
 *  `<marker>` no SVG e recebe a cor como atributo — atributo de SVG não lê
 *  `var()` de forma confiável, então o hex é repetido aqui. Mudou o token,
 *  muda esta linha. */
const EDGE_COLOR = '#23262b'

const PALETTE: FlowNode['type'][] = [
  'message',
  'buttons',
  'carousel',
  'bubbles',
  'image',
  'video',
  'audio',
  'file',
  'ask',
  'wait_reply',
  'condition',
  'randomize',
  'delay',
  'tag',
  'set_field',
  'http',
  'goto_flow',
  'unsubscribe',
  'end',
]

function Canvas({
  definition,
  flowOptions,
  hasDelivery,
  deliverySlot,
  onChange,
}: {
  definition: FlowDefinition
  flowOptions: FlowOption[]
  /** Se a automação tem entrega vinculada — decide se `{{presente}}` sem entrega vira aviso. */
  hasDelivery: boolean
  /** O seletor de entrega, montado pelo editor: só ele conhece o `flowId`. */
  deliverySlot?: React.ReactNode
  onChange: (next: FlowDefinition) => void
}) {
  // O canvas assume a posse do grafo no primeiro render; depois disso a fonte
  // da verdade é ele, não a prop.
  const initial = useMemo(() => definitionToGraph(definition), [definition])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  /** Contador em ref: ids estáveis sem depender de aleatoriedade no render. */
  const counter = useRef(0)

  const entry = definition.entry

  /**
   * Onde o fluxo perde gente. Recalculado a cada mudança da definição, no
   * navegador — a análise é pura, então não custa ida ao servidor.
   */
  const leaks = useMemo(() => findLeaks(definition, { hasDelivery }), [definition, hasDelivery])

  /** Toda mutação do grafo reflete de volta na definição que será salva. */
  const sync = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      onChange(graphToDefinition(nextNodes, nextEdges, entry))
    },
    [entry, onChange],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        // Uma saída leva a um destino só: reconectar substitui a aresta anterior.
        const cleaned = current.filter(
          (e) =>
            !(
              e.source === connection.source &&
              (e.sourceHandle ?? null) === (connection.sourceHandle ?? null)
            ),
        )
        const next = addEdge(connection, cleaned)
        setNodes((ns) => {
          sync(ns, next)
          return ns
        })
        return next
      })
    },
    [setEdges, setNodes, sync],
  )

  function addNode(type: FlowNode['type']) {
    let id = `${type}_${(counter.current += 1)}`
    while (nodes.some((n) => n.id === id)) id = `${type}_${(counter.current += 1)}`

    const spawn = {
      x: 40 + (nodes.length % 3) * 300,
      y: 60 + Math.floor(nodes.length / 3) * 200 + nodes.length * 20,
    }

    const next = [
      ...nodes,
      {
        id,
        type: 'builder',
        position: spawn,
        data: blankNode(type) as unknown as Record<string, unknown>,
      } satisfies Node,
    ]

    setNodes(next)
    sync(next, edges)
    setSelectedId(id)
    setPaletteOpen(false)
  }

  function updateNode(id: string, data: FlowNode) {
    const next = nodes.map((n) =>
      n.id === id
        ? { ...n, data: { ...(data as unknown as Record<string, unknown>), isEntry: id === entry } }
        : n,
    )
    setNodes(next)
    sync(next, edges)
  }

  function deleteNode(id: string) {
    if (id === entry) return
    const nextNodes = nodes.filter((n) => n.id !== id)
    const nextEdges = edges.filter((e) => e.source !== id && e.target !== id)
    setNodes(nextNodes)
    setEdges(nextEdges)
    sync(nextNodes, nextEdges)
    setSelectedId(null)
  }

  const selected = nodes.find((n) => n.id === selectedId)

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => {
            onNodesChange(changes)
            // Só persiste ao soltar o nó, para não gravar a cada pixel arrastado.
            if (changes.some((c) => c.type === 'position' && !c.dragging)) {
              setNodes((current) => {
                sync(current, edges)
                return current
              })
            }
          }}
          onEdgesChange={(changes) => {
            onEdgesChange(changes)
            if (changes.some((c) => c.type === 'remove')) {
              setEdges((current) => {
                setNodes((ns) => {
                  sync(ns, current)
                  return ns
                })
                return current
              })
            }
          }}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: EDGE_COLOR, strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: EDGE_COLOR },
          }}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 2.5 }}
        >
          {/* Mesmo fio das arestas: a trama do fundo é textura, não informação. */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={EDGE_COLOR} />
          {/* Sufixo `!` (Tailwind 4): as regras `.react-flow__controls` da
              biblioteca vêm sem camada e ganhariam do utilitário normal. */}
          <Controls className="bottom-4! left-4!" showInteractive={false} />
        </ReactFlow>

        {deliverySlot && (
          // No mesmo canto dos avisos e logo acima deles, porque é daqui que
          // sai a resposta do aviso mais provável: "{{presente}} sem entrega
          // vinculada". Conserto longe do alerta é conserto que não acontece.
          <div className="pop-panel absolute right-4 top-4 z-10 w-80 rounded-md">
            {deliverySlot}
          </div>
        )}

        {leaks.length > 0 && (
          // Fica no canto oposto à paleta e é clicável: cada aviso leva ao
          // bloco. Alerta que não leva ao lugar do problema vira ruído que a
          // pessoa aprende a ignorar.
          <div
            className={cn(
              'pop-panel absolute right-4 z-10 w-80 rounded-md',
              deliverySlot ? 'top-32' : 'top-4',
            )}
          >
            <p className="label border-b border-border px-3 py-2 text-[9px] text-muted">
              {leaks.length} {leaks.length === 1 ? 'ponto a conferir' : 'pontos a conferir'}
            </p>
            <ul className="max-h-64 divide-y divide-border overflow-y-auto">
              {leaks.map((leak, index) => (
                <li key={`${leak.nodeId}-${index}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(leak.nodeId)}
                    className="w-full px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  >
                    <span
                      className={cn(
                        'label text-[9px]',
                        leak.level === 'erro' && 'text-danger',
                        leak.level === 'aviso' && 'text-warning',
                        leak.level === 'nota' && 'text-muted',
                      )}
                    >
                      {leak.nodeId}
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-muted">
                      {leak.message}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="absolute left-4 top-4 z-10">
          <Button type="button" size="sm" onClick={() => setPaletteOpen((v) => !v)}>
            <Plus className="size-4" />
            Adicionar bloco
          </Button>

          {paletteOpen && (
            <div className="pop-panel mt-2 max-h-[75vh] w-72 overflow-y-auto rounded-md py-1.5">
              {CATEGORY_ORDER.map((category) => {
                const types = PALETTE.filter((type) => NODE_META[type].category === category)
                if (types.length === 0) return null
                return (
                  <div key={category}>
                    {/* `bg-surface` porque o cabeçalho é grudento e passa por
                        cima dos itens ao rolar — precisa ser opaco, e é a
                        mesma superfície do `.pop-panel` que o envolve. */}
                    <p className="label sticky top-0 z-10 bg-surface px-3 pt-2.5 pb-1.5 text-[10px] text-muted">
                      {CATEGORY_LABEL[category]}
                    </p>
                    {types.map((type) => {
                      const meta = NODE_META[type]
                      const Icon = meta.icon
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => addNode(type)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:outline-none"
                        >
                          <span className={cn(NODE_CHIP, 'size-7')}>
                            <Icon className={cn('size-3.5', nodeGlyph(type))} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{meta.label}</p>
                            <p className="truncate text-[11px] leading-tight text-muted">
                              {meta.description}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <NodeInspector
          node={selected.data as unknown as FlowNode}
          isEntry={selected.id === entry}
          flowOptions={flowOptions}
          onChange={(data) => updateNode(selected.id, data)}
          onDelete={() => deleteNode(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

export function FlowBuilder(props: {
  definition: FlowDefinition
  flowOptions: FlowOption[]
  hasDelivery: boolean
  deliverySlot?: React.ReactNode
  onChange: (next: FlowDefinition) => void
}) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
