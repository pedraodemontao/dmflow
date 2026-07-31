import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Flame,
  ImageOff,
  Inbox,
  Minus,
  OctagonAlert,
  TrendingUp,
} from 'lucide-react'

import { FailedRuns } from '@/components/painel/failed-runs'
import { Risco } from '@/components/painel/risco'
import { Badge, Card, EmptyState } from '@/components/ui'
import { RankBars, TimeSeries } from '@/components/ui/chart'
import type { CockpitData } from '@/lib/data'
import type { RiskLevel } from '@/lib/risk/types'
import { cn } from '@/lib/utils'

/**
 * O cockpit do painel: as perguntas que o dono faz ao abrir a ferramenta, não
 * quatro números de vaidade. Hierarquia deliberada — quem exige AÇÃO (falha,
 * gente esperando, travados) fica em cima; CONTEXTO (tendência de leads,
 * conteúdo que traz) fica embaixo. Só apresentação: todo dado já vem pronto
 * de `getCockpitData` (src/lib/data.ts).
 */

const RISK_LABEL: Record<RiskLevel, string> = {
  verde: 'baixo',
  amarelo: 'atenção',
  vermelho: 'alto',
}

function Eyebrow({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** Cartão de alerta padrão das três "ação" — mesmo esqueleto dos alertas de saúde da conta em page.tsx. */
function ActionCard({
  tone,
  icon,
  title,
  description,
  children,
}: {
  tone: 'danger' | 'warning' | 'accent'
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="surface-panel relative overflow-hidden rounded-md p-4 pl-5">
      {/* O tom vira uma barra sólida na lateral em vez de tingir card e texto.
          Tingir era herança da base clara e sempre custava contraste: texto
          colorido sobre fundo da mesma cor. Assim o título fica em branco
          cheio e a cor continua identificando a urgência de relance. */}
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          tone === 'danger' && 'bg-danger',
          tone === 'warning' && 'bg-warning',
          tone === 'accent' && 'bg-accent',
        )}
      />

      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 shrink-0',
            tone === 'danger' && 'text-danger',
            tone === 'warning' && 'text-warning',
            tone === 'accent' && 'text-accent',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

function TrendBadge({ delta, deltaPercent }: { delta: number; deltaPercent: number | null }) {
  if (delta === 0) {
    return (
      <Badge tone="neutral">
        <Minus className="size-3" />
        igual a ontem
      </Badge>
    )
  }

  const up = delta > 0
  const percent = deltaPercent === null ? '' : ` (${up ? '+' : ''}${deltaPercent}%)`

  return (
    <Badge tone={up ? 'success' : 'warning'}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? '+' : ''}
      {delta}
      {percent}
    </Badge>
  )
}

export function Cockpit({ data }: { data: CockpitData }) {
  const { leadsTrend, leadsSeries, sends, leadSources, stuck, failedRuns, inboxCounts, riskReport } =
    data

  const waiting = inboxCounts['nao-lidas']
  const riskElevated = riskReport && riskReport.level !== 'verde'

  const needsAction = failedRuns.length > 0 || waiting > 0 || stuck.total > 0 || riskElevated

  return (
    <div className="space-y-6">
      <section>
        <Eyebrow>Precisa de ação</Eyebrow>

        {!needsAction ? (
          <EmptyState
            icon={<CheckCircle2 className="size-8" />}
            title="Tudo em dia"
            description="Nenhuma automação falhando, ninguém travado no meio do fluxo e ninguém esperando resposta agora."
          />
        ) : (
          <div className="space-y-3">
            {riskElevated && riskReport && (
              <ActionCard
                tone={riskReport.level === 'vermelho' ? 'danger' : 'warning'}
                icon={<OctagonAlert className="size-4" />}
                title={`Risco de flag ${RISK_LABEL[riskReport.level]}`}
                description={riskReport.recommendation}
              />
            )}

            <div className="grid gap-3 md:grid-cols-3">
              {failedRuns.length > 0 && (
                <ActionCard
                  tone="danger"
                  icon={<OctagonAlert className="size-4" />}
                  title={`${stuck.failed} ${stuck.failed === 1 ? 'disparo falhou' : 'disparos falharam'}`}
                  description="flow_runs travado em “failed” não tenta de novo sozinho: ou volta para a fila do cron, ou é dispensado aqui."
                >
                  <FailedRuns runs={failedRuns} total={stuck.failed} />
                </ActionCard>
              )}

              {waiting > 0 && (
                <ActionCard
                  tone="accent"
                  icon={<Inbox className="size-4" />}
                  title={`${waiting} ${waiting === 1 ? 'pessoa esperando' : 'pessoas esperando'} resposta`}
                  description="Mensagem chegou e ainda não foi lida — cada minuto aqui é gente esperando do outro lado."
                >
                  <Link
                    href="/conversas?fila=nao-lidas"
                    className="mt-3 inline-block text-[11px] font-medium text-accent hover:underline"
                  >
                    abrir conversas →
                  </Link>
                </ActionCard>
              )}

              {stuck.total > 0 && (
                <ActionCard
                  tone="warning"
                  icon={<Clock className="size-4" />}
                  title={`${stuck.total} travados no meio do fluxo`}
                  description={`${stuck.failed} pararam com erro, ${stuck.staleWaitingReply} esperam resposta há mais de 24h — dinheiro parado: chegaram a interagir e a automação não fechou com eles.`}
                >
                  {stuck.topAutomation && (
                    <Link
                      href={`/automacoes/${stuck.topAutomation.triggerId}/metricas`}
                      className="mt-3 inline-block text-[11px] font-medium text-warning hover:underline"
                    >
                      {stuck.topAutomation.count} só em “{stuck.topAutomation.flowName}” →
                    </Link>
                  )}
                </ActionCard>
              )}
            </div>
          </div>
        )}
      </section>

      <section>
        <Eyebrow>Contexto</Eyebrow>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="p-4">
            <div className="mb-1 flex items-start justify-between gap-2">
              <span className="label text-[10px] text-muted">Leads hoje</span>
              <TrendingUp className="size-3.5 shrink-0 text-muted" />
            </div>

            <p className="display text-6xl tabular-nums">{leadsTrend.today}</p>

            <div className="mt-3 mb-4 flex flex-wrap items-center gap-2">
              <TrendBadge delta={leadsTrend.delta} deltaPercent={leadsTrend.deltaPercent} />
              <span className="text-[11px] text-muted">ontem: {leadsTrend.yesterday}</span>
            </div>

            {/* A curva de 30 dias embaixo do número: o número diz quanto, a
                curva diz se está subindo. Sem ela o painel só tinha fotos do
                agora. */}
            <TimeSeries
              points={leadsSeries}
              height={56}
              aria-label="Leads por dia nos últimos 30 dias"
            />
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border p-4">
              <Flame className="size-4 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Conteúdo que mais traz lead</p>
                <p className="text-[11px] text-muted">
                  Só quem chegou comentando — vale o post que trouxe a pessoa pela primeira vez.
                </p>
              </div>
            </div>

            {leadSources.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<ImageOff className="size-8" />}
                  title="Sem dados ainda"
                  description="Assim que alguém comentar num post ou reel, ele aparece aqui rankeado pelo tanto de lead que trouxe."
                />
              </div>
            ) : (
              <RankBars
                className="px-4"
                items={leadSources.map((source) => ({
                  id: source.mediaId,
                  value: source.leads,
                  valueLabel: `${source.leads} ${source.leads === 1 ? 'lead' : 'leads'}`,
                  leading: source.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={source.thumbnail}
                      alt=""
                      className="size-11 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-2">
                      <ImageOff className="size-4 text-muted" />
                    </div>
                  ),
                  label: (
                    <span className="flex items-baseline gap-2">
                      <Link
                        href={`/contatos?post=${source.mediaId}`}
                        className="truncate rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {source.caption?.trim() || 'Post fora das últimas 50 mídias'}
                      </Link>
                      {source.permalink && (
                        <a
                          href={source.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="label shrink-0 text-[9px] text-muted hover:text-accent"
                        >
                          Instagram ↗
                        </a>
                      )}
                    </span>
                  ),
                }))}
              />
            )}
          </Card>
        </div>

        {/* Envios por hora é o gráfico mais operacional do painel: o cap e o
            relatório de risco dizem "0 de 60 na última hora" sem mostrar o
            FORMATO da curva — e é o formato que denuncia disparo concentrado,
            o padrão que custou restrição de conta em jul/2026. */}
        <Card className="mt-4 p-4">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <span className="label text-[10px] text-muted">Envios por hora · últimas 24h</span>
            <span className="label text-[9px] text-muted">
              pico {Math.max(0, ...sends.points.map((p) => p.value))} · teto {sends.cap}
            </span>
          </div>

          <TimeSeries
            points={sends.points}
            height={88}
            threshold={{ value: sends.cap, label: `cap ${sends.cap}/h` }}
            aria-label="Envios por hora nas últimas 24 horas"
          />
        </Card>

        {/* O banner lá em cima só dá o veredito. O detalhamento por sinal é o
            diferencial real contra o ManyChat — é o que diz POR QUE o risco
            subiu e o que dá para mudar. Fica aqui embaixo justamente porque é
            leitura, não ação. */}
        {riskReport && (
          <div className="mt-4">
            <Risco report={riskReport} />
          </div>
        )}
      </section>
    </div>
  )
}
