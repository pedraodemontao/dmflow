'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Clock,
  Flag,
  GitBranch,
  MessageSquare,
  MousePointerClick,
  Tag,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { FlowNode } from '@/lib/flow/types'

export const NODE_META: Record<
  FlowNode['type'],
  { label: string; icon: LucideIcon; color: string; description: string }
> = {
  message: {
    label: 'Mensagem',
    icon: MessageSquare,
    color: 'text-sky-400',
    description: 'Envia um texto, com respostas rápidas opcionais',
  },
  buttons: {
    label: 'Botões',
    icon: MousePointerClick,
    color: 'text-violet-400',
    description: 'Card com até 3 botões de link ou resposta',
  },
  wait_reply: {
    label: 'Esperar resposta',
    icon: Clock,
    color: 'text-amber-400',
    description: 'Pausa até a pessoa responder',
  },
  condition: {
    label: 'Condição',
    icon: GitBranch,
    color: 'text-emerald-400',
    description: 'Divide o caminho conforme a resposta ou tag',
  },
  delay: {
    label: 'Espera',
    icon: Clock,
    color: 'text-orange-400',
    description: 'Aguarda um tempo antes de continuar',
  },
  tag: {
    label: 'Etiqueta',
    icon: Tag,
    color: 'text-pink-400',
    description: 'Marca ou desmarca etiquetas no contato',
  },
  http: {
    label: 'Webhook',
    icon: Webhook,
    color: 'text-cyan-400',
    description: 'Chama um sistema externo (n8n, CRM, checkout)',
  },
  end: {
    label: 'Fim',
    icon: Flag,
    color: 'text-muted',
    description: 'Encerra o fluxo',
  },
}

function truncate(text: string, max = 70) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Resumo curto mostrado dentro do card no canvas. */
function preview(data: FlowNode): string {
  switch (data.type) {
    case 'message':
      return truncate(data.text || 'Sem texto ainda')
    case 'buttons':
      return truncate(data.text || 'Sem texto ainda')
    case 'wait_reply':
      return data.saveAs ? `Guarda em "${data.saveAs}"` : 'Aguarda a resposta'
    case 'condition':
      return `${data.cases.length} ${data.cases.length === 1 ? 'caminho' : 'caminhos'}`
    case 'delay': {
      const s = data.seconds
      if (s >= 3600) return `Espera ${Math.round(s / 3600)}h`
      if (s >= 60) return `Espera ${Math.round(s / 60)}min`
      return `Espera ${s}s`
    }
    case 'tag': {
      const parts: string[] = []
      if (data.add?.length) parts.push(`+${data.add.join(', ')}`)
      if (data.remove?.length) parts.push(`−${data.remove.join(', ')}`)
      return parts.join('  ') || 'Nenhuma etiqueta'
    }
    case 'http':
      return truncate(data.url, 40)
    case 'end':
      return 'O fluxo termina aqui'
  }
}

export type BuilderNodeData = FlowNode & { isEntry?: boolean }

export function BuilderNode({ data, selected }: NodeProps) {
  const node = data as unknown as BuilderNodeData
  const meta = NODE_META[node.type]
  const Icon = meta.icon

  return (
    <div
      className={cn(
        'w-64 rounded-xl border bg-surface shadow-lg transition-colors',
        selected ? 'border-accent' : 'border-border',
      )}
    >
      {node.type !== 'message' || !node.isEntry ? (
        <Handle type="target" position={Position.Top} />
      ) : (
        <Handle type="target" position={Position.Top} />
      )}

      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon className={cn('size-4', meta.color)} />
        <span className="text-xs font-semibold">{meta.label}</span>
        {node.isEntry && (
          <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
            início
          </span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <p className="text-xs leading-relaxed text-muted">{preview(node)}</p>

        {node.type === 'message' && node.quickReplies?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {node.quickReplies.map((qr, i) => (
              <span
                key={i}
                className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] text-accent"
              >
                {qr.title}
              </span>
            ))}
          </div>
        ) : null}

        {node.type === 'buttons' && node.buttons.length ? (
          <div className="mt-2 flex flex-col gap-1">
            {node.buttons.map((b, i) => (
              <span
                key={i}
                className="rounded-md border border-border px-2 py-1 text-center text-[10px]"
              >
                {b.title}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {node.type === 'condition' ? (
        <div className="flex border-t border-border">
          {node.cases.map((c, i) => (
            <div key={i} className="relative flex-1 px-2 py-1.5 text-center">
              <span className="text-[10px] text-emerald-400">
                {c.value ? truncate(c.value, 12) : c.op}
              </span>
              <Handle
                type="source"
                position={Position.Bottom}
                id={`case-${i}`}
                style={{ left: `${((i + 0.5) / (node.cases.length + 1)) * 100}%` }}
              />
            </div>
          ))}
          <div className="relative flex-1 px-2 py-1.5 text-center">
            <span className="text-[10px] text-muted">senão</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="fallback"
              style={{ left: `${((node.cases.length + 0.5) / (node.cases.length + 1)) * 100}%` }}
            />
          </div>
        </div>
      ) : node.type !== 'end' ? (
        <Handle type="source" position={Position.Bottom} />
      ) : null}
    </div>
  )
}

export const nodeTypes = { builder: BuilderNode }
