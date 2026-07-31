import { BarChart3 } from 'lucide-react'

import { Card, EmptyState } from '@/components/ui'
import { RankBars, type RankItem } from '@/components/ui/chart'
import type { NodeMetric } from '@/lib/data'
import { outgoing } from '@/lib/flow/transform'
import type { FlowDefinition } from '@/lib/flow/types'

/**
 * O funil da automação: quanta gente chega em cada bloco, NA ORDEM EM QUE O
 * FLUXO CAMINHA.
 *
 * `getFlowMetrics` devolve os blocos ordenados por volume, que é a ordem
 * errada para esta pergunta: a tela existe para responder ONDE a automação
 * perde gente, e queda só se enxerga na sequência. Por isso a ordem aqui é a
 * caminhada a partir da entrada (mesma regra de aresta do canvas, via
 * `outgoing`), e a barra de cada linha é proporcional ao bloco mais visitado.
 *
 * Blocos que receberam gente mas não estão mais na definição (foram apagados
 * do fluxo depois) vão para o fim da lista — o dado é real e sumir com ele
 * seria mentir sobre o total.
 */

const NODE_LABEL: Record<string, string> = {
  message: 'Mensagem',
  buttons: 'Botões',
  carousel: 'Carrossel',
  bubbles: 'Várias mensagens',
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  file: 'Arquivo',
  ask: 'Perguntar',
  wait_reply: 'Esperar resposta',
  condition: 'Condição',
  randomize: 'Sorteio',
  delay: 'Espera',
  tag: 'Etiqueta',
  set_field: 'Gravar campo',
  http: 'Webhook',
  goto_flow: 'Pular para outro fluxo',
  unsubscribe: 'Descadastrar',
  end: 'Fim',
}

/** Ordem de caminhada a partir da entrada, largura primeiro. */
function walkOrder(definition: FlowDefinition): Map<string, number> {
  const order = new Map<string, number>()
  const queue: string[] = [definition.entry]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (order.has(id) || !definition.nodes[id]) continue
    order.set(id, order.size)
    for (const next of outgoing(definition.nodes[id])) {
      if (next) queue.push(next)
    }
  }

  return order
}

/**
 * O bloco onde mais gente ficou pelo caminho: quem chegou nele menos quem
 * chegou em algum dos blocos seguintes. Soma os destinos (num `condition` ou
 * `randomize` cada pessoa segue por um só) e conta cada destino uma vez, senão
 * dois casos apontando para o mesmo bloco inflariam o "seguiu".
 */
function biggestLoss(metrics: NodeMetric[], definition: FlowDefinition) {
  const peopleById = new Map(metrics.map((metric) => [metric.nodeId, metric.people]))
  let worst: { nodeId: string; nodeType: string; lost: number; people: number } | null = null

  for (const metric of metrics) {
    const node = definition.nodes[metric.nodeId]
    if (!node) continue

    const targets = new Set(outgoing(node).filter((id): id is string => Boolean(id)))
    if (targets.size === 0) continue

    let followed = 0
    for (const target of targets) followed += peopleById.get(target) ?? 0

    const lost = metric.people - followed
    if (lost > 0 && (worst === null || lost > worst.lost)) {
      worst = { nodeId: metric.nodeId, nodeType: metric.nodeType, lost, people: metric.people }
    }
  }

  return worst
}

export function FlowFunnel({
  metrics,
  definition,
}: {
  metrics: NodeMetric[]
  /** Nulo quando a definição salva não passa mais no schema — o funil vira só ordem de volume. */
  definition: FlowDefinition | null
}) {
  if (metrics.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-8" />}
        title="Sem dados ainda"
        description="Assim que alguém passar pelo fluxo, cada bloco mostra quantas pessoas chegaram nele — e onde elas param."
      />
    )
  }

  const order = definition ? walkOrder(definition) : null
  const ordered = order
    ? [...metrics].sort(
        (a, b) =>
          (order.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER),
      )
    : metrics
  const worst = definition ? biggestLoss(metrics, definition) : null

  const items: RankItem[] = ordered.map((metric) => {
    const isEntry = definition?.entry === metric.nodeId

    return {
      id: metric.nodeId,
      value: metric.people,
      valueLabel: metric.people,
      // Âmbar onde mais gente ficou pelo caminho, limão na entrada (o 100% de
      // referência) — o resto em branco. Duas marcas por tela; barra colorida
      // em toda linha não destacaria nada. A perda ganha do "início" quando as
      // duas caem na mesma linha: a entrada já está escrita ao lado do nome, a
      // queda não estaria.
      tone: metric.nodeId === worst?.nodeId ? 'warning' : isEntry ? 'accent' : 'ink',
      label: (
        <span className="flex items-baseline gap-2">
          <span className="truncate">{NODE_LABEL[metric.nodeType] ?? metric.nodeType}</span>
          <span className="label shrink-0 text-[9px] text-muted tabular-nums">
            {metric.share}%
          </span>
          <span className="label shrink-0 truncate text-[9px] text-muted">{metric.nodeId}</span>
          {isEntry && <span className="label shrink-0 text-[9px] text-accent">início</span>}
          {order && !order.has(metric.nodeId) && (
            <span className="label shrink-0 text-[9px] text-muted">fora do fluxo</span>
          )}
        </span>
      ),
    }
  })

  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-4 border-b border-border p-4">
        <div className="min-w-0">
          <p className="label text-[10px] text-muted">Funil por bloco</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {order
              ? 'Na ordem em que o fluxo caminha — a queda entre duas linhas é onde a automação perde gente.'
              : 'A definição salva não passa mais no schema, então a ordem aqui é por volume.'}
          </p>
        </div>
        <p className="label shrink-0 text-[9px] text-muted">pessoas</p>
      </div>

      <RankBars className="px-4" items={items} />

      {worst && (
        <p className="border-t border-border p-4 text-xs leading-relaxed text-muted">
          Maior perda em{' '}
          <span className="text-foreground">
            {NODE_LABEL[worst.nodeType] ?? worst.nodeType}
          </span>{' '}
          <span className="label text-[10px]">{worst.nodeId}</span>: de {worst.people}{' '}
          {worst.people === 1 ? 'pessoa que chegou' : 'pessoas que chegaram'} nele,{' '}
          <span className="text-warning tabular-nums">{worst.lost}</span> não seguiram para o
          bloco seguinte.
        </p>
      )}
    </Card>
  )
}
