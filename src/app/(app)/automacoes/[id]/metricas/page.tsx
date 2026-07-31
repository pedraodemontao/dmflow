import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BarChart3 } from 'lucide-react'

import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { getAutomation, getFlowMetrics } from '@/lib/data'
import { flowDefinitionSchema } from '@/lib/flow/types'

export const dynamic = 'force-dynamic'

const NODE_LABEL: Record<string, string> = {
  message: 'Mensagem',
  buttons: 'Botões',
  image: 'Imagem',
  ask: 'Perguntar',
  wait_reply: 'Esperar resposta',
  condition: 'Condição',
  randomize: 'Sorteio',
  delay: 'Espera',
  tag: 'Etiqueta',
  set_field: 'Gravar campo',
  http: 'Webhook',
  unsubscribe: 'Descadastrar',
  end: 'Fim',
}

export default async function MetricasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const automation = await getAutomation(id)
  if (!automation) notFound()

  const metrics = await getFlowMetrics(automation.flow.id)
  const parsed = flowDefinitionSchema.safeParse(automation.flow.definition)
  const entryId = parsed.success ? parsed.data.entry : null

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        <Link href={`/automacoes/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-sm font-semibold">Métricas · {automation.flow.name}</h1>
        <Badge tone={automation.trigger.is_active ? 'success' : 'neutral'}>
          {automation.trigger.is_active ? 'ativa' : 'pausada'}
        </Badge>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{automation.stats.runs}</p>
            <p className="text-[11px] text-muted">disparos</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{automation.stats.done}</p>
            <p className="text-[11px] text-muted">chegaram ao fim</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-semibold tabular-nums">
              {automation.stats.runs > 0
                ? Math.round((automation.stats.done / automation.stats.runs) * 100)
                : 0}
              %
            </p>
            <p className="text-[11px] text-muted">taxa de conclusão</p>
          </Card>
        </div>

        {metrics.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="size-8" />}
            title="Sem dados ainda"
            description="Assim que alguém passar pelo fluxo, cada bloco mostra quantas pessoas chegaram nele — e onde elas param."
          />
        ) : (
          <Card className="divide-y divide-border">
            {metrics.map((metric) => (
              <div key={metric.nodeId} className="p-4">
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-xs font-medium">
                    {NODE_LABEL[metric.nodeType] ?? metric.nodeType}
                  </span>
                  <span className="text-[11px] text-muted">{metric.nodeId}</span>
                  {metric.nodeId === entryId && <Badge tone="accent">início</Badge>}
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {metric.people}
                  </span>
                  <span className="text-[11px] text-muted">
                    {metric.people === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${metric.share}%` }} />
                </div>
              </div>
            ))}
          </Card>
        )}

        <p className="mt-4 text-[11px] text-muted">
          Contagem por pessoa, não por passagem: se o bloco “Perguntar” repreguntar, a mesma
          pessoa conta uma vez só. A barra compara com o bloco mais visitado do fluxo.
        </p>
      </main>
    </>
  )
}
