'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import { Plus } from 'lucide-react'

import { NODE_META, nodeTypes } from '@/components/automacoes/flow-nodes'
import { NodeInspector } from '@/components/automacoes/node-inspector'
import { Button } from '@/components/ui'
import { blankNode, definitionToGraph, graphToDefinition } from '@/lib/flow/transform'
import type { FlowDefinition, FlowNode } from '@/lib/flow/types'
import { cn } from '@/lib/utils'

const PALETTE: FlowNode['type'][] = [
  'message',
  'buttons',
  'wait_reply',
  'condition',
  'delay',
  'tag',
  'http',
  'end',
]

function Canvas({
  definition,
  onChange,
}: {
  definition: FlowDefinition
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
          defaultEdgeOptions={{ animated: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#232936" />
          <Controls className="!bottom-4 !left-4" showInteractive={false} />
        </ReactFlow>

        <div className="absolute left-4 top-4 z-10">
          <Button type="button" size="sm" onClick={() => setPaletteOpen((v) => !v)}>
            <Plus className="size-4" />
            Adicionar bloco
          </Button>

          {paletteOpen && (
            <div className="mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
              {PALETTE.map((type) => {
                const meta = NODE_META[type]
                const Icon = meta.icon
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addNode(type)}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <Icon className={cn('mt-0.5 size-4 shrink-0', meta.color)} />
                    <div>
                      <p className="text-xs font-medium">{meta.label}</p>
                      <p className="text-[11px] leading-tight text-muted">{meta.description}</p>
                    </div>
                  </button>
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
  onChange: (next: FlowDefinition) => void
}) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
