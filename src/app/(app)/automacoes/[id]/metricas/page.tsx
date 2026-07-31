import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity, ArrowLeft } from 'lucide-react'

import { ButtonClicks } from '@/components/automacoes/button-clicks'
import { FlowFunnel } from '@/components/automacoes/flow-funnel'
import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { BigNumber, LineSeries, Meter, TimeSeries } from '@/components/ui/chart'
import {
  getAutomation,
  getAutomationConversionSeries,
  getAutomationSeries,
  getButtonClicks,
  getFlowMetrics,
} from '@/lib/data'
import { flowDefinitionSchema } from '@/lib/flow/types'

export const dynamic = 'force-dynamic'

export default async function MetricasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const automation = await getAutomation(id)
  if (!automation) notFound()

  const [metrics, series, conversion, buttonClicks] = await Promise.all([
    getFlowMetrics(automation.flow.id),
    getAutomationSeries(automation.flow.id),
    getAutomationConversionSeries(automation.flow.id),
    getButtonClicks(automation.flow.id),
  ])
  const parsed = flowDefinitionSchema.safeParse(automation.flow.definition)

  const { runs, done } = automation.stats
  const rate = runs > 0 ? done / runs : 0

  // Mês inteiro em zero desenha duas linhas coladas na base — parece gráfico
  // quebrado, não "não aconteceu nada". Melhor dizer com todas as letras, e
  // separar "nunca rodou" de "rodou e parou": são problemas diferentes.
  const hasConversion = [...conversion.started, ...conversion.done].some(
    (point) => point.value > 0,
  )

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

          {/* Logo abaixo da taxa, porque é a pergunta que a taxa não responde:
              ela é um número só do período inteiro e não diz se a conversão
              caiu depois da última mexida no fluxo. Duas linhas na mesma
              régua — a DISTÂNCIA entre elas é a perda, e é isso que se lê de
              relance. Régua separada faria as duas mentirem lado a lado. */}
          <Card className="p-5">
            <div className="mb-4">
              <span className="label text-[10px] text-muted">
                Iniciados × concluídos por dia · 30 dias
              </span>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                A folga entre as duas linhas é quem entrou e não terminou. Leia a tendência, não o
                dia: quem entra hoje pode concluir amanhã, então as linhas de um mesmo dia não são
                a mesma turma.
              </p>
            </div>

            {hasConversion ? (
              <LineSeries
                height={170}
                aria-label="Disparos iniciados e concluídos por dia nos últimos 30 dias"
                series={[
                  { id: 'started', label: 'Iniciados', tone: 'ink', points: conversion.started },
                  { id: 'done', label: 'Concluídos', tone: 'accent', points: conversion.done },
                ]}
              />
            ) : (
              <EmptyState
                icon={<Activity className="size-8" />}
                title={runs > 0 ? 'Parada há mais de 30 dias' : 'Sem disparo nenhum'}
                description={
                  runs > 0
                    ? `Esta automação já teve ${runs} ${runs === 1 ? 'disparo' : 'disparos'}, mas nenhum começou nem terminou nos últimos 30 dias. A taxa acima é histórica.`
                    : 'A curva aparece no primeiro disparo. Até lá não há o que comparar entre entrada e conclusão.'
                }
              />
            )}
          </Card>

          {/* A curva de entrada desta automação. O funil diz ONDE perde gente;
              isto diz SE ainda está entrando gente — sem os dois, uma queda de
              volume passa por queda de conversão. */}
          <Card className="p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <span className="label text-[10px] text-muted">Disparos por dia · 30 dias</span>
              <span className="label text-[9px] text-muted">
                pico {Math.max(0, ...series.map((point) => point.value))}
              </span>
            </div>
            <TimeSeries
              points={series}
              height={80}
              aria-label="Disparos por dia nos últimos 30 dias"
            />
          </Card>

          <FlowFunnel metrics={metrics} definition={parsed.success ? parsed.data : null} />

          <ButtonClicks
            groups={buttonClicks}
            definition={parsed.success ? parsed.data : null}
          />

          <p className="text-[11px] leading-relaxed text-muted">
            Contagem por pessoa, não por passagem: se o bloco “Perguntar” repreguntar, a mesma
            pessoa conta uma vez só. A barra compara com o bloco mais visitado do fluxo.
          </p>
        </div>
      </main>
    </>
  )
}
