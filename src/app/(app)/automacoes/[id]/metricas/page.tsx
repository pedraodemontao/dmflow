import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { FlowFunnel } from '@/components/automacoes/flow-funnel'
import { Badge, Button, Card } from '@/components/ui'
import { BigNumber, Meter } from '@/components/ui/chart'
import { getAutomation, getFlowMetrics } from '@/lib/data'
import { flowDefinitionSchema } from '@/lib/flow/types'

export const dynamic = 'force-dynamic'

export default async function MetricasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const automation = await getAutomation(id)
  if (!automation) notFound()

  const metrics = await getFlowMetrics(automation.flow.id)
  const parsed = flowDefinitionSchema.safeParse(automation.flow.definition)

  const { runs, done } = automation.stats
  const rate = runs > 0 ? done / runs : 0

  return (
    <>
      <header className="chrome-panel flex h-16 shrink-0 items-center gap-3 border-b px-6">
        <Link href={`/automacoes/${id}`}>
          <Button variant="ghost" size="sm" aria-label="Voltar para a automação">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="display truncate text-4xl text-foreground">
          Métricas · {automation.flow.name}
        </h1>
        <Badge tone={automation.trigger.is_active ? 'success' : 'neutral'}>
          {automation.trigger.is_active ? 'ativa' : 'pausada'}
        </Badge>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-3xl space-y-3">
          <div className="grid gap-3 md:grid-cols-[1.15fr_1fr]">
            {/* A pergunta de cima: de quem entrou, quanta gente chegou ao fim.
                Número grande em display + barra embaixo — a fração precisa de
                forma, não de um terceiro número igual aos outros. */}
            <Card className="p-5">
              <BigNumber
                size="lg"
                value={`${Math.round(rate * 100)}%`}
                label="taxa de conclusão"
                hint={
                  runs > 0
                    ? `${done} de ${runs} ${runs === 1 ? 'disparo terminou' : 'disparos terminaram'} o fluxo. O resto parou no meio ou ainda está andando.`
                    : 'Nenhum disparo ainda.'
                }
              />
              <Meter
                className="mt-4"
                value={rate}
                aria-label={`Taxa de conclusão: ${Math.round(rate * 100)}%`}
              />
            </Card>

            <Card className="grid grid-cols-2 divide-x divide-border">
              <div className="p-5">
                <BigNumber value={runs} label="disparos" />
              </div>
              <div className="p-5">
                <BigNumber value={done} label="terminaram" />
              </div>
            </Card>
          </div>

          <FlowFunnel metrics={metrics} definition={parsed.success ? parsed.data : null} />

          <p className="text-[11px] leading-relaxed text-muted">
            Contagem por pessoa, não por passagem: se o bloco “Perguntar” repreguntar, a mesma
            pessoa conta uma vez só. A barra compara com o bloco mais visitado do fluxo.
          </p>
        </div>
      </main>
    </>
  )
}
