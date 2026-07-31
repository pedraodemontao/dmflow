'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  BellOff,
  Clock,
  Flag,
  GalleryHorizontal,
  GitBranch,
  HelpCircle,
  Image as ImageIcon,
  MessagesSquare,
  MessageSquare,
  MousePointerClick,
  Shuffle,
  Tag,
  Variable,
  Webhook,
  Workflow,
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
  carousel: {
    label: 'Carrossel',
    icon: GalleryHorizontal,
    color: 'text-orange-300',
    description: 'Até 10 cards com título, subtítulo, imagem e botões',
  },
  bubbles: {
    label: 'Várias mensagens',
    icon: MessagesSquare,
    color: 'text-sky-300',
    description: 'Manda mensagens curtas em sequência, com pausa entre elas',
  },
  goto_flow: {
    label: 'Pular para outro fluxo',
    icon: Workflow,
    color: 'text-lime-400',
    description: 'Encerra este fluxo e continua a conversa em outro',
  },
  image: {
    label: 'Imagem',
    icon: ImageIcon,
    color: 'text-fuchsia-400',
    description: 'Envia uma imagem por link público',
  },
  ask: {
    label: 'Perguntar',
    icon: HelpCircle,
    color: 'text-teal-400',
    description: 'Pergunta e valida a resposta (e-mail, telefone, número)',
  },
  set_field: {
    label: 'Gravar campo',
    icon: Variable,
    color: 'text-indigo-400',
    description: 'Guarda um valor na ficha do contato',
  },
  randomize: {
    label: 'Sorteio',
    icon: Shuffle,
    color: 'text-rose-400',
    description: 'Divide o tráfego entre caminhos — teste A/B',
  },
  unsubscribe: {
    label: 'Descadastrar',
    icon: BellOff,
    color: 'text-red-400',
    description: 'Para de enviar automação para este contato',
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
    case 'carousel':
      return `${data.cards.length} ${data.cards.length === 1 ? 'card' : 'cards'}`
    case 'bubbles':
      return `${data.bubbles.length} mensagens, pausa de ${(data.pauseMs / 1000).toFixed(1)}s`
    case 'goto_flow':
      return data.flowId ? `Fluxo ${truncate(data.flowId, 24)}` : 'Escolha o fluxo de destino'
    case 'image':
      return data.url && data.url !== 'https://' ? truncate(data.url, 40) : 'Sem imagem ainda'
    case 'ask': {
      const label: Record<string, string> = {
        text: 'texto',
        email: 'e-mail',
        phone: 'telefone',
        number: 'número',
      }
      return `${truncate(data.text, 40)} → ${label[data.expect]} em "${data.saveAs}"`
    }
    case 'set_field':
      return data.fields.map((f) => `${f.key}=${f.value}`).join(', ')
    case 'randomize':
      return `${data.paths.length} caminhos, chance igual`
    case 'unsubscribe':
      return 'Para de receber automação'
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

        {node.type === 'carousel' && node.cards.length ? (
          <div className="mt-2 flex gap-1 overflow-hidden">
            {node.cards.slice(0, 4).map((card, i) => (
              <span
                key={i}
                className="truncate rounded-md border border-border px-2 py-1 text-[10px]"
              >
                {truncate(card.title, 16)}
              </span>
            ))}
          </div>
        ) : null}

        {node.type === 'bubbles' && node.bubbles.length ? (
          <div className="mt-2 flex flex-col gap-1">
            {node.bubbles.map((b, i) => (
              <span
                key={i}
                className="truncate rounded-md border border-border px-2 py-1 text-[10px]"
              >
                {truncate(b.text, 30)}
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
      ) : node.type === 'randomize' ? (
        <div className="flex border-t border-border">
          {node.paths.map((path, i) => (
            <div key={i} className="relative flex-1 px-2 py-1.5 text-center">
              <span className="text-[10px] text-rose-400">{truncate(path.label, 10)}</span>
              <Handle
                type="source"
                position={Position.Bottom}
                id={`path-${i}`}
                style={{ left: `${((i + 0.5) / node.paths.length) * 100}%` }}
              />
            </div>
          ))}
        </div>
      ) : node.type !== 'end' && node.type !== 'goto_flow' ? (
        <Handle type="source" position={Position.Bottom} />
      ) : null}
    </div>
  )
}

export const nodeTypes = { builder: BuilderNode }
