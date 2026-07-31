'use client'

import type { ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  AudioLines,
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
  Paperclip,
  Shuffle,
  Tag,
  Variable,
  Video,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { FlowNode } from '@/lib/flow/types'

/**
 * Quatro naturezas de bloco — usadas para agrupar a paleta ("Adicionar bloco")
 * e como selo discreto no topo de cada card no canvas.
 */
export type NodeCategory = 'send' | 'wait' | 'decide' | 'data'

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
  send: 'Enviar',
  wait: 'Esperar',
  decide: 'Decidir',
  data: 'Dados',
}

export const CATEGORY_ORDER: NodeCategory[] = ['send', 'wait', 'decide', 'data']

export const NODE_META: Record<
  FlowNode['type'],
  {
    label: string
    icon: LucideIcon
    /** Cor do glifo do ícone — mesma família de matiz do `chip`. */
    color: string
    /** Borda + fundo do chip que envolve o ícone, mesma matiz de `color` a baixa opacidade. */
    chip: string
    description: string
    category: NodeCategory
  }
> = {
  message: {
    label: 'Mensagem',
    icon: MessageSquare,
    color: 'text-sky-400',
    chip: 'border-sky-400/30 bg-sky-400/10',
    description: 'Envia um texto, com respostas rápidas opcionais',
    category: 'send',
  },
  buttons: {
    label: 'Botões',
    icon: MousePointerClick,
    color: 'text-violet-400',
    chip: 'border-violet-400/30 bg-violet-400/10',
    description: 'Card com até 3 botões de link ou resposta',
    category: 'send',
  },
  carousel: {
    label: 'Carrossel',
    icon: GalleryHorizontal,
    color: 'text-orange-300',
    chip: 'border-orange-300/30 bg-orange-300/10',
    description: 'Até 10 cards com título, subtítulo, imagem e botões',
    category: 'send',
  },
  bubbles: {
    label: 'Várias mensagens',
    icon: MessagesSquare,
    color: 'text-sky-300',
    chip: 'border-sky-300/30 bg-sky-300/10',
    description: 'Manda mensagens curtas em sequência, com pausa entre elas',
    category: 'send',
  },
  goto_flow: {
    label: 'Pular para outro fluxo',
    icon: Workflow,
    color: 'text-lime-400',
    chip: 'border-lime-400/30 bg-lime-400/10',
    description: 'Encerra este fluxo e continua a conversa em outro',
    category: 'data',
  },
  image: {
    label: 'Imagem',
    icon: ImageIcon,
    color: 'text-fuchsia-400',
    chip: 'border-fuchsia-400/30 bg-fuchsia-400/10',
    description: 'Envia uma imagem por link público',
    category: 'send',
  },
  video: {
    label: 'Vídeo',
    icon: Video,
    color: 'text-fuchsia-300',
    chip: 'border-fuchsia-300/30 bg-fuchsia-300/10',
    description: 'Envia um vídeo por link público',
    category: 'send',
  },
  audio: {
    label: 'Áudio',
    icon: AudioLines,
    color: 'text-fuchsia-500',
    chip: 'border-fuchsia-500/30 bg-fuchsia-500/10',
    description: 'Envia um áudio por link público',
    category: 'send',
  },
  file: {
    label: 'Arquivo',
    icon: Paperclip,
    color: 'text-fuchsia-200',
    chip: 'border-fuchsia-200/30 bg-fuchsia-200/10',
    description: 'Envia um arquivo (PDF, etc.) por link público',
    category: 'send',
  },
  ask: {
    label: 'Perguntar',
    icon: HelpCircle,
    color: 'text-teal-400',
    chip: 'border-teal-400/30 bg-teal-400/10',
    description: 'Pergunta e valida a resposta (e-mail, telefone, número)',
    category: 'wait',
  },
  set_field: {
    label: 'Gravar campo',
    icon: Variable,
    color: 'text-indigo-400',
    chip: 'border-indigo-400/30 bg-indigo-400/10',
    description: 'Guarda um valor na ficha do contato',
    category: 'data',
  },
  randomize: {
    label: 'Sorteio',
    icon: Shuffle,
    color: 'text-rose-400',
    chip: 'border-rose-400/30 bg-rose-400/10',
    description: 'Divide o tráfego entre caminhos — teste A/B',
    category: 'decide',
  },
  unsubscribe: {
    label: 'Descadastrar',
    icon: BellOff,
    color: 'text-red-400',
    chip: 'border-red-400/30 bg-red-400/10',
    description: 'Para de enviar automação para este contato',
    category: 'data',
  },
  wait_reply: {
    label: 'Esperar resposta',
    icon: Clock,
    color: 'text-amber-400',
    chip: 'border-amber-400/30 bg-amber-400/10',
    description: 'Pausa até a pessoa responder',
    category: 'wait',
  },
  condition: {
    label: 'Condição',
    icon: GitBranch,
    color: 'text-emerald-400',
    chip: 'border-emerald-400/30 bg-emerald-400/10',
    description: 'Divide o caminho conforme a resposta ou tag',
    category: 'decide',
  },
  delay: {
    label: 'Espera',
    icon: Clock,
    color: 'text-orange-400',
    chip: 'border-orange-400/30 bg-orange-400/10',
    description: 'Aguarda um tempo antes de continuar',
    category: 'wait',
  },
  tag: {
    label: 'Etiqueta',
    icon: Tag,
    color: 'text-pink-400',
    chip: 'border-pink-400/30 bg-pink-400/10',
    description: 'Marca ou desmarca etiquetas no contato',
    category: 'data',
  },
  http: {
    label: 'Webhook',
    icon: Webhook,
    color: 'text-cyan-400',
    chip: 'border-cyan-400/30 bg-cyan-400/10',
    description: 'Chama um sistema externo (n8n, CRM, checkout)',
    category: 'data',
  },
  end: {
    label: 'Fim',
    icon: Flag,
    color: 'text-muted',
    chip: 'border-border bg-surface-2',
    description: 'Encerra o fluxo',
    category: 'data',
  },
}

const OP_LABEL: Record<string, string> = {
  contains: 'contém',
  equals: 'é',
  starts_with: 'começa',
  has_tag: 'tag',
  exists: 'existe',
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
    case 'video':
      return data.url && data.url !== 'https://' ? truncate(data.url, 40) : 'Sem vídeo ainda'
    case 'audio':
      return data.url && data.url !== 'https://' ? truncate(data.url, 40) : 'Sem áudio ainda'
    case 'file':
      return data.url && data.url !== 'https://' ? truncate(data.url, 40) : 'Sem arquivo ainda'
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

/**
 * Tons das portas de saída "desenhadas" (condição/sorteio). Ficam levemente
 * tingidas na cor da família em repouso; o estado de arraste sempre vira
 * accent (ver `Port`), então a cor de família nunca compete com o feedback
 * de conexão.
 */
const PORT_TONE = {
  neutral: '!border-border !bg-surface-2',
  emerald: '!border-emerald-400/50 !bg-emerald-400/10',
  rose: '!border-rose-400/50 !bg-rose-400/10',
} as const

/**
 * Porta de encaixe do bloco — um "pino" quadrado com sombra interna em vez da
 * bolinha padrão do React Flow. Geometria e cor de repouso usam utilitários
 * `!importante`: as regras `.react-flow__handle` do globals.css são CSS puro
 * (fora de `@layer`), então batem qualquer utilitário Tailwind normal — só
 * `!important` (mesma origem, prioridade maior nessa comparação) ou `style`
 * inline vencem. Os estados de arraste (`connectingfrom`/`connectingto`/
 * `valid`/`connectionindicator`) são classes que o próprio React Flow
 * alterna no handle durante o drag; `[&.classe]:` os apanha sem JS extra.
 * Cresce por `width`/`height` (nunca `scale`) pra não brigar com o
 * `transform: translate(...)` que a biblioteca usa pra centralizar a porta.
 */
function Port({
  type,
  position,
  id,
  tone = 'neutral',
}: {
  type: 'source' | 'target'
  position: Position
  id?: string
  tone?: keyof typeof PORT_TONE
}) {
  return (
    <Handle
      type={type}
      position={position}
      id={id}
      className={cn(
        '!size-3 !rounded-[4px] !border-[1.5px] !shadow-[inset_0_1px_1px_rgb(0_0_0_/45%)]',
        'transition-[width,height,background-color,border-color,box-shadow] duration-150',
        PORT_TONE[tone],
        'hover:!size-3.5 hover:!border-accent hover:!bg-accent/20',
        '[&.connectingfrom]:!size-3.5 [&.connectingfrom]:!border-accent [&.connectingfrom]:!bg-accent [&.connectingfrom]:!shadow-[0_0_0_4px_rgb(242_118_46_/25%)]',
        '[&.connectingto]:!size-3.5 [&.connectingto]:!border-accent [&.connectingto]:!bg-accent',
        '[&.valid]:!size-4 [&.valid]:!border-accent [&.valid]:!bg-accent [&.valid]:!shadow-[0_0_0_5px_rgb(242_118_46_/30%)]',
        '[&.connectionindicator]:!border-accent/70',
      )}
    />
  )
}

/** Fileira de saídas rotuladas (condição/sorteio) — cada uma com seu próprio pino. */
function OutputRow({ children }: { children: ReactNode }) {
  return <div className="flex divide-x divide-border/60 border-t border-border/60">{children}</div>
}

const OUTPUT_DOT: Record<'emerald' | 'rose' | 'muted', string> = {
  emerald: 'bg-emerald-400',
  rose: 'bg-rose-400',
  muted: 'bg-muted',
}
const OUTPUT_TEXT: Record<'emerald' | 'rose' | 'muted', string> = {
  emerald: 'text-emerald-300',
  rose: 'text-rose-300',
  muted: 'text-muted',
}

function OutputCell({
  tone,
  label,
  children,
}: {
  tone: 'emerald' | 'rose' | 'muted'
  label: string
  children: ReactNode
}) {
  return (
    <div className="relative flex-1 px-1.5 pb-3.5 pt-2 text-center">
      <div className="flex items-center justify-center gap-1">
        <span className={cn('size-1 shrink-0 rounded-full', OUTPUT_DOT[tone])} />
        <span className={cn('truncate text-[10px] font-semibold', OUTPUT_TEXT[tone])}>{label}</span>
      </div>
      {children}
    </div>
  )
}

export function BuilderNode({ data, selected }: NodeProps) {
  const node = data as unknown as BuilderNodeData
  const meta = NODE_META[node.type]
  const Icon = meta.icon
  const hasBottomPort = node.type !== 'end' && node.type !== 'goto_flow'

  return (
    <div
      className={cn(
        // Card de dado no canvas — pode haver muitos ao mesmo tempo, por isso
        // é sólido (.surface-panel), nunca vidro: dezenas de backdrop-filter
        // no mesmo canvas custariam caro à toa. Profundidade vem de sombra e
        // borda, nunca de blur.
        'surface-panel w-64 rounded-2xl border transition-[transform,box-shadow,border-color] duration-150',
        selected
          ? 'border-accent shadow-[0_0_0_1px_var(--accent),0_20px_40px_-18px_rgb(242_118_46_/40%)]'
          : 'border-border/70 hover:-translate-y-0.5 hover:border-muted/80 hover:shadow-[0_18px_36px_-18px_rgb(0_0_0_/60%)]',
      )}
    >
      <Port type="target" position={Position.Top} />

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border', meta.chip)}>
          <Icon className={cn('size-4', meta.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {CATEGORY_LABEL[meta.category]}
          </p>
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{meta.label}</p>
        </div>
        {node.isEntry && (
          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent ring-1 ring-inset ring-accent/25">
            início
          </span>
        )}
      </div>

      <div className="border-t border-border/60 px-3 py-2.5">
        <p className="rounded-lg bg-surface-2/70 px-2.5 py-2 text-[11px] leading-relaxed text-muted ring-1 ring-inset ring-white/[0.03]">
          {preview(node)}
        </p>

        {node.type === 'message' && node.quickReplies?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {node.quickReplies.slice(0, 6).map((qr, i) => (
              <span
                key={i}
                className="rounded-full border border-accent/40 bg-accent/5 px-2 py-0.5 text-[10px] text-accent"
              >
                {qr.title}
              </span>
            ))}
            {node.quickReplies.length > 6 && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
                +{node.quickReplies.length - 6}
              </span>
            )}
          </div>
        ) : null}

        {node.type === 'buttons' && node.buttons.length ? (
          <div className="mt-2 flex flex-col gap-1">
            {node.buttons.map((b, i) => (
              <span
                key={i}
                className="truncate rounded-md border border-border bg-surface-2/50 px-2 py-1 text-center text-[10px]"
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
                className="truncate rounded-md border border-border bg-surface-2/50 px-2 py-1 text-[10px]"
              >
                {truncate(card.title, 16)}
              </span>
            ))}
            {node.cards.length > 4 && (
              <span className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] text-muted">
                +{node.cards.length - 4}
              </span>
            )}
          </div>
        ) : null}

        {node.type === 'bubbles' && node.bubbles.length ? (
          <div className="mt-2 flex flex-col gap-1">
            {node.bubbles.map((b, i) => (
              <span
                key={i}
                className="truncate rounded-md border border-border bg-surface-2/50 px-2 py-1 text-[10px]"
              >
                {truncate(b.text, 30)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {node.type === 'condition' ? (
        <OutputRow>
          {node.cases.map((c, i) => (
            <OutputCell key={i} tone="emerald" label={c.value ? truncate(c.value, 12) : OP_LABEL[c.op]}>
              <Port type="source" position={Position.Bottom} id={`case-${i}`} tone="emerald" />
            </OutputCell>
          ))}
          <OutputCell tone="muted" label="senão">
            <Port type="source" position={Position.Bottom} id="fallback" />
          </OutputCell>
        </OutputRow>
      ) : node.type === 'randomize' ? (
        <OutputRow>
          {node.paths.map((path, i) => (
            <OutputCell key={i} tone="rose" label={truncate(path.label, 10)}>
              <Port type="source" position={Position.Bottom} id={`path-${i}`} tone="rose" />
            </OutputCell>
          ))}
        </OutputRow>
      ) : hasBottomPort ? (
        <Port type="source" position={Position.Bottom} />
      ) : null}
    </div>
  )
}

export const nodeTypes = { builder: BuilderNode }
