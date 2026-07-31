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
import { Badge, Card, EmptyState } from '@/components/ui'
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

const RISK_BADGE_TONE: Record<RiskLevel, 'success' | 'warning' | 'neutral'> = {
  verde: 'success',
  amarelo: 'warning',
  vermelho: 'neutral',
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
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-4',
        tone === 'danger' && 'border-danger/40 bg-danger/10',
        tone === 'warning' && 'border-warning/30 bg-warning/10',
        tone === 'accent' && 'border-accent/30 bg-accent/10',
      )}
    >
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
        <p
          className={cn(
            'text-sm font-medium',
            tone === 'danger' && 'text-danger',
            tone === 'warning' && 'text-warning',
            tone === 'accent' && 'text-accent',
          )}
        >
          {title}
        </p>
        <p className="mt-1 text-xs text-muted">{description}</p>
        {children}
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
  const { leadsTrend, leadSources, stuck, failedRuns, inboxCounts, riskReport } = data

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
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Leads hoje
              </span>
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                <TrendingUp className="size-3.5" />
              </div>
            </div>

            <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {leadsTrend.today}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TrendBadge delta={leadsTrend.delta} deltaPercent={leadsTrend.deltaPercent} />
              <span className="text-[11px] text-muted">ontem: {leadsTrend.yesterday}</span>
            </div>

            {riskReport && !riskElevated && (
              <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-muted">
                Risco de flag
                <Badge tone={RISK_BADGE_TONE[riskReport.level]}>{RISK_LABEL[riskReport.level]}</Badge>
              </p>
            )}
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
              <div className="divide-y divide-border">
                {leadSources.map((source, index) => (
                  <div key={source.mediaId} className="flex items-center gap-3 p-3">
                    <span className="w-4 shrink-0 text-center font-mono text-[11px] text-muted">
                      {index + 1}
                    </span>

                    {source.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={source.thumbnail}
                        alt=""
                        className="size-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                        <ImageOff className="size-4 text-muted" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs">
                        {source.caption?.trim() || (
                          <span className="text-muted">Post fora das últimas 50 mídias</span>
                        )}
                      </p>
                      {source.permalink && (
                        <a
                          href={source.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-accent hover:underline"
                        >
                          ver no Instagram
                        </a>
                      )}
                    </div>

                    <Link
                      href={`/contatos?post=${source.mediaId}`}
                      className="shrink-0 rounded-md text-right transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      <p className="font-mono text-sm font-semibold tabular-nums">{source.leads}</p>
                      <p className="text-[11px] text-muted">{source.leads === 1 ? 'lead' : 'leads'}</p>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  )
}
