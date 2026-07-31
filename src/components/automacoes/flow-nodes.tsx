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

/**
 * A cor de categoria sobrevive como QUATRO tons, não dezoito. Antes cada tipo
 * de bloco tinha matiz própria (sky, violet, fuchsia, teal, indigo, rose...) e
 * o canvas virava arco-íris: dezoito cores não formam sistema, só ruído — e
 * nenhuma delas significava nada, porque tipos da mesma natureza usavam
 * matizes diferentes.
 *
 * Agora a cor identifica a NATUREZA do bloco e sai de tokens que já existem:
 *
 *   enviar  → `foreground`  o que a pessoa recebe; é o caso comum, então é
 *                           branco — cor viva em tudo não destaca nada.
 *   esperar → `warning`     tempo. Mesmo âmbar do aviso de janela de 24h.
 *   decidir → `success`     o caminho que abre — mesmo verde das saídas de
 *                           condição lá embaixo.
 *   dados   → `muted`       bastidor: a pessoa não vê acontecer.
 *
 * O limão (`accent`) fica FORA desta tabela de propósito: no canvas ele é
 * reservado para seleção e para o bloco de entrada. Se uma categoria inteira
 * fosse limão, o bloco selecionado deixaria de ser óbvio.
 *
 * Contraste do glifo sobre `surface-2` (o chip): branco 15.5:1, âmbar 9.7:1,
 * verde 9.7:1, cinza 5.7:1, coral 6.4:1 — todos acima dos 3:1 de elemento de
 * UI. O NOME da categoria sai sempre em `muted`, nunca no tom: assim o texto
 * tem contraste garantido e a cor fica só no glifo, que é sinal e não leitura.
 */
const CATEGORY_GLYPH: Record<NodeCategory, string> = {
  send: 'text-foreground',
  wait: 'text-warning',
  decide: 'text-success',
  data: 'text-muted',
}

export const NODE_META: Record<
  FlowNode['type'],
  {
    label: string
    icon: LucideIcon
    description: string
    category: NodeCategory
    /** Exceção à cor da categoria — só onde a cor é informação, não decoração. */
    glyph?: string
  }
> = {
  message: {
    label: 'Mensagem',
    icon: MessageSquare,
    description: 'Envia um texto, com respostas rápidas opcionais',
    category: 'send',
  },
  buttons: {
    label: 'Botões',
    icon: MousePointerClick,
    description: 'Card com até 3 botões de link ou resposta',
    category: 'send',
  },
  carousel: {
    label: 'Carrossel',
    icon: GalleryHorizontal,
    description: 'Até 10 cards com título, subtítulo, imagem e botões',
    category: 'send',
  },
  bubbles: {
    label: 'Várias mensagens',
    icon: MessagesSquare,
    description: 'Manda mensagens curtas em sequência, com pausa entre elas',
    category: 'send',
  },
  goto_flow: {
    label: 'Pular para outro fluxo',
    icon: Workflow,
    description: 'Encerra este fluxo e continua a conversa em outro',
    category: 'data',
  },
  image: {
    label: 'Imagem',
    icon: ImageIcon,
    description: 'Envia uma imagem por link público',
    category: 'send',
  },
  video: {
    label: 'Vídeo',
    icon: Video,
    description: 'Envia um vídeo por link público',
    category: 'send',
  },
  audio: {
    label: 'Áudio',
    icon: AudioLines,
    description: 'Envia um áudio por link público',
    category: 'send',
  },
  file: {
    label: 'Arquivo',
    icon: Paperclip,
    description: 'Envia um arquivo (PDF, etc.) por link público',
    category: 'send',
  },
  ask: {
    label: 'Perguntar',
    icon: HelpCircle,
    description: 'Pergunta e valida a resposta (e-mail, telefone, número)',
    category: 'wait',
  },
  set_field: {
    label: 'Gravar campo',
    icon: Variable,
    description: 'Guarda um valor na ficha do contato',
    category: 'data',
  },
  randomize: {
    label: 'Sorteio',
    icon: Shuffle,
    description: 'Divide o tráfego entre caminhos — teste A/B',
    category: 'decide',
  },
  unsubscribe: {
    label: 'Descadastrar',
    icon: BellOff,
    description: 'Para de enviar automação para este contato',
    category: 'data',
    // Único bloco irreversível para o contato: aqui o coral é informação.
    glyph: 'text-danger',
  },
  wait_reply: {
    label: 'Esperar resposta',
    icon: Clock,
    description: 'Pausa até a pessoa responder',
    category: 'wait',
  },
  condition: {
    label: 'Condição',
    icon: GitBranch,
    description: 'Divide o caminho conforme a resposta ou tag',
    category: 'decide',
  },
  delay: {
    label: 'Espera',
    icon: Clock,
    description: 'Aguarda um tempo antes de continuar',
    category: 'wait',
  },
  tag: {
    label: 'Etiqueta',
    icon: Tag,
    description: 'Marca ou desmarca etiquetas no contato',
    category: 'data',
  },
  http: {
    label: 'Webhook',
    icon: Webhook,
    description: 'Chama um sistema externo (n8n, CRM, checkout)',
    category: 'data',
  },
  end: {
    label: 'Fim',
    icon: Flag,
    description: 'Encerra o fluxo',
    category: 'data',
  },
}

/** Cor do glifo de um tipo de bloco — categoria, salvo exceção documentada. */
export function nodeGlyph(type: FlowNode['type']): string {
  const meta = NODE_META[type]
  return meta.glyph ?? CATEGORY_GLYPH[meta.category]
}

/**
 * Moldura do ícone. Sempre neutra (fio + superfície recuada), em qualquer
 * bloco: quem carrega a cor é o glifo dentro dela. Chip tingido por tipo era
 * o que mais espalhava matiz pela tela. Falta só o tamanho, que cada uso põe.
 */
export const NODE_CHIP =
  'flex shrink-0 items-center justify-center rounded-sm border border-border bg-surface-2'

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
 * tingidas na cor da categoria em repouso; o estado de arraste sempre vira
 * accent (ver `Port`), então a cor de categoria nunca compete com o feedback
 * de conexão.
 */
const PORT_TONE = {
  neutral: 'border-border! bg-surface-2!',
  branch: 'border-success/50! bg-success/10!',
} as const

/**
 * Porta de encaixe do bloco — um "pino" quadrado em vez da bolinha padrão do
 * React Flow. Geometria e cor de repouso usam utilitários importantes: as
 * regras `.react-flow__handle` do globals.css são CSS puro (fora de `@layer`),
 * e no Tailwind 4 TODO utilitário mora em `@layer utilities` — regra sem
 * camada ganha de regra em camada por definição, independente de ordem ou
 * especificidade. Só declaração `!important` vence.
 *
 * O sufixo é `classe!`, a sintaxe do Tailwind 4. A forma antiga `!classe`
 * (v3) não é reconhecida: não gera CSS nenhum, some sem erro — foi o que
 * acontecia aqui, e por isso o pino não reagia a hover nem a arraste.
 *
 * Os estados de arraste (`connectingfrom`/`connectingto`/`valid`/
 * `connectionindicator`) são classes que o próprio React Flow alterna no
 * handle durante o drag; `[&.classe]:` os apanha sem JS extra. Cresce por
 * `width`/`height` (nunca `scale`) pra não brigar com o `transform:
 * translate(...)` que a biblioteca usa pra centralizar a porta.
 *
 * O halo do arraste é limão (`214 242 74`) — o mesmo accent do resto da tela.
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
        'size-3! rounded-[2px]! border-[1.5px]!',
        'transition-[width,height,background-color,border-color,box-shadow] duration-150',
        PORT_TONE[tone],
        'hover:size-3.5! hover:border-accent! hover:bg-accent/25!',
        '[&.connectingfrom]:size-3.5! [&.connectingfrom]:border-accent! [&.connectingfrom]:bg-accent! [&.connectingfrom]:shadow-[0_0_0_4px_rgb(214_242_74_/25%)]!',
        '[&.connectingto]:size-3.5! [&.connectingto]:border-accent! [&.connectingto]:bg-accent!',
        '[&.valid]:size-4! [&.valid]:border-accent! [&.valid]:bg-accent! [&.valid]:shadow-[0_0_0_5px_rgb(214_242_74_/30%)]!',
        '[&.connectionindicator]:border-accent/70!',
      )}
    />
  )
}

/** Fileira de saídas rotuladas (condição/sorteio) — cada uma com seu próprio pino. */
function OutputRow({ selected, children }: { selected: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex divide-x border-t',
        selected ? 'divide-background/25 border-background/25' : 'divide-border border-border',
      )}
    >
      {children}
    </div>
  )
}

/**
 * Saída rotulada. Segue a gramática do `Badge`: quadradinho de cor + texto
 * neutro. Assim o rótulo (`.label`, monospace) tem contraste garantido em
 * qualquer estado, e a cor continua distinguindo caminho de escape.
 */
function OutputCell({
  tone,
  label,
  selected,
  children,
}: {
  tone: 'branch' | 'muted'
  label: string
  selected: boolean
  children: ReactNode
}) {
  return (
    <div className="relative flex-1 px-1.5 pt-2 pb-3.5 text-center">
      <div className="flex items-center justify-center gap-1.5">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-[1px]',
            selected ? 'bg-background/60' : tone === 'branch' ? 'bg-success' : 'bg-muted',
          )}
        />
        <span
          className={cn(
            'label truncate text-[9px]',
            selected ? 'text-background/80' : 'text-muted',
          )}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

export function BuilderNode({ data, selected = false }: NodeProps) {
  const node = data as unknown as BuilderNodeData
  const meta = NODE_META[node.type]
  const Icon = meta.icon
  const hasBottomPort = node.type !== 'end' && node.type !== 'goto_flow'

  return (
    <div
      className={cn(
        // Cartão colado no quadro: fio de cabelo, canto duro e sombra
        // DESLOCADA SEM DESFOQUE. É a metáfora certa para um construtor —
        // peça recortada e colada sobre a mesa, não card flutuando com brilho.
        'w-64 rounded-md border shadow-[var(--shadow-hard)]',
        'transition-[background-color,border-color,box-shadow] duration-150',
        selected
          ? // Seleção = marca-texto. O limão preenche e o texto vira quase
            // preto por cima (16:1). Um bloco por vez, então a cor rara
            // continua rara — e não há como confundir qual está aberto no
            // inspetor.
            'border-accent bg-accent text-background'
          : // `bg-surface border-border` em vez de `.surface-panel`: a classe
            // do globals.css é regra sem camada e ganharia do utilitário de
            // hover, deixando o realce morto (ver comentário do `Port`).
            'border-border bg-surface hover:border-muted',
      )}
    >
      <Port type="target" position={Position.Top} />

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div
          className={cn(
            NODE_CHIP,
            'size-8',
            selected && 'border-background/30 bg-background/10',
          )}
        >
          <Icon className={cn('size-4', selected ? 'text-background' : nodeGlyph(node.type))} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('label text-[9px]', selected ? 'text-background/80' : 'text-muted')}>
            {CATEGORY_LABEL[meta.category]}
          </p>
          <p className="mt-0.5 truncate text-[13px] leading-tight font-semibold">{meta.label}</p>
        </div>
        {node.isEntry && (
          <span
            className={cn(
              'label shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px]',
              selected
                ? 'border-background/40 text-background'
                : 'border-accent/50 text-accent',
            )}
          >
            início
          </span>
        )}
      </div>

      <div className={cn('border-t px-3 py-2.5', selected ? 'border-background/25' : 'border-border')}>
        <p
          className={cn(
            'rounded-sm border px-2.5 py-2 text-[11px] leading-relaxed',
            selected
              ? 'border-background/25 bg-background/10 text-background/80'
              : 'border-border bg-surface-2 text-muted',
          )}
        >
          {preview(node)}
        </p>

        {node.type === 'message' && node.quickReplies?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {node.quickReplies.slice(0, 6).map((qr, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-sm border px-2 py-0.5 text-[10px]',
                  selected
                    ? 'border-background/30 text-background/80'
                    : 'border-border bg-surface-2 text-muted',
                )}
              >
                {qr.title}
              </span>
            ))}
            {node.quickReplies.length > 6 && (
              <span
                className={cn(
                  'label rounded-sm border px-2 py-0.5 text-[10px]',
                  selected ? 'border-background/30 text-background/80' : 'border-border text-muted',
                )}
              >
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
                className={cn(
                  'truncate rounded-sm border px-2 py-1 text-center text-[10px]',
                  selected ? 'border-background/30' : 'border-border bg-surface-2',
                )}
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
                className={cn(
                  'truncate rounded-sm border px-2 py-1 text-[10px]',
                  selected ? 'border-background/30' : 'border-border bg-surface-2',
                )}
              >
                {truncate(card.title, 16)}
              </span>
            ))}
            {node.cards.length > 4 && (
              <span
                className={cn(
                  'label shrink-0 rounded-sm border px-2 py-1 text-[10px]',
                  selected ? 'border-background/30 text-background/80' : 'border-border text-muted',
                )}
              >
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
                className={cn(
                  'truncate rounded-sm border px-2 py-1 text-[10px]',
                  selected ? 'border-background/30' : 'border-border bg-surface-2',
                )}
              >
                {truncate(b.text, 30)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {node.type === 'condition' ? (
        <OutputRow selected={selected}>
          {node.cases.map((c, i) => (
            <OutputCell
              key={i}
              tone="branch"
              selected={selected}
              label={c.value ? truncate(c.value, 12) : OP_LABEL[c.op]}
            >
              <Port type="source" position={Position.Bottom} id={`case-${i}`} tone="branch" />
            </OutputCell>
          ))}
          <OutputCell tone="muted" selected={selected} label="senão">
            <Port type="source" position={Position.Bottom} id="fallback" />
          </OutputCell>
        </OutputRow>
      ) : node.type === 'randomize' ? (
        <OutputRow selected={selected}>
          {node.paths.map((path, i) => (
            // Caminhos de sorteio têm a mesma chance: nenhum é o "certo",
            // então nenhum recebe a cor de desvio.
            <OutputCell key={i} tone="muted" selected={selected} label={truncate(path.label, 10)}>
              <Port type="source" position={Position.Bottom} id={`path-${i}`} />
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
