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
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { DroppedEvents } from '@/components/painel/dropped-events'
import { FailedRuns } from '@/components/painel/failed-runs'
import { Risco } from '@/components/painel/risco'
import { Badge, Card, EmptyState } from '@/components/ui'
import { LineSeries, RankBars, TimeSeries } from '@/components/ui/chart'
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

/**
 * Tom de cada curva de post, na ordem do ranking. Sem `danger`: coral no
 * painel significa "algo quebrou", e post que traz lead não é erro.
 */
const SOURCE_TONES = ['accent', 'ink', 'warning'] as const

/** Quanto da legenda do post cabe antes de a linha virar sopa de letras. */
const SOURCE_LABEL_CHARS = 18

/**
 * Rótulo da série de um post: o NÚMERO do ranking logo acima, e só um naco da
 * legenda como lembrete.
 *
 * A legenda de post tem parágrafos — jogada inteira aqui, as três viram um
 * bloco de texto e a comparação some. O número resolve as duas coisas de uma
 * vez: é curto e é o mesmo "01/02/03" que a lista de cima já imprime ao lado
 * da miniatura, então dá para saber qual linha é qual sem depender de separar
 * limão de âmbar de cinza.
 */
function sourceLabel(rank: number, caption: string | null | undefined) {
  const numero = String(rank).padStart(2, '0')
  const texto = caption?.trim().replace(/\s+/g, ' ') ?? ''

  if (!texto) return `${numero} · sem legenda`

  return `${numero} · ${
    texto.length > SOURCE_LABEL_CHARS ? `${texto.slice(0, SOURCE_LABEL_CHARS)}…` : texto
  }`
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
  const {
    leadsTrend,
    sendsByKind,
    dropped,
    droppedTotal,
    leadsSeries,
    sends,
    leadSources,
    leadSourceSeries,
    stuck,
    failedRuns,
    inboxCounts,
    riskReport,
  } = data

  const sourceCurves = leadSourceSeries.flatMap((series, index) => {
    const source = leadSources.find((item) => item.mediaId === series.mediaId)
    if (!source) return []

    return [
      {
        id: series.mediaId,
        label: sourceLabel(index + 1, source.caption),
        tone: SOURCE_TONES[index] ?? 'ink',
        points: series.points,
      },
    ]
  })

  // Post no ranking cujo último lead é mais velho que a janela desenha três
  // linhas coladas na base — o que é a resposta certa ("já deram o que
  // tinham"), mas lida como gráfico quebrado. Melhor escrever.
  const hasSourceCurves = sourceCurves.some((curve) =>
    curve.points.some((point) => point.value > 0),
  )

  const waiting = inboxCounts['nao-lidas']
  const riskElevated = riskReport && riskReport.level !== 'verde'

  const needsAction =
    dropped.length > 0 || failedRuns.length > 0 || waiting > 0 || stuck.total > 0 || riskElevated

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

            {/* Primeiro card da seção, acima de tudo: comentário sem resposta
                fura a invariante do produto. Falha de disparo é dinheiro
                parado; comentário perdido é o lead que nunca soube que existia
                uma resposta. */}
            {dropped.length > 0 && (
              <ActionCard
                tone="danger"
                icon={<OctagonAlert className="size-4" />}
                title={`${droppedTotal} ${droppedTotal === 1 ? 'comentário ficou' : 'comentários ficaram'} sem resposta`}
                description="A fila desistiu depois de esgotar as tentativas. Todo comentário deveria ser respondido, nem que demore — estes não foram."
              >
                <DroppedEvents events={dropped} total={droppedTotal} />
              </ActionCard>
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

        {/* O ranking acima responde "quem trouxe mais no total" e é cego para
            "quem AINDA está trazendo": o post que estourou há três semanas e
            morreu aparece do mesmo tamanho que o que está subindo agora. Aqui
            as três primeiras colocações no tempo, na mesma régua vertical —
            escala separada por post faria as curvas mentirem lado a lado. */}
        <Card className="mt-4 p-4">
          <div className="mb-4">
            <span className="label text-[10px] text-muted">
              Leads por dia dos 3 primeiros · 30 dias
            </span>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Os mesmos 01, 02 e 03 da lista acima. Linha descendo é post que já deu o que tinha;
              linha subindo é onde vale insistir — o total do ranking não separa os dois.
            </p>
          </div>

          {sourceCurves.length === 0 || !hasSourceCurves ? (
            <EmptyState
              icon={
                sourceCurves.length === 0 ? (
                  <ImageOff className="size-8" />
                ) : (
                  <TrendingDown className="size-8" />
                )
              }
              title={sourceCurves.length === 0 ? 'Sem dados ainda' : 'Nada nos últimos 30 dias'}
              description={
                sourceCurves.length === 0
                  ? 'A curva aparece quando o primeiro comentário virar lead. Até lá não há post para comparar no tempo.'
                  : 'Os posts do ranking trouxeram gente, mas nenhum lead novo entrou por eles nos últimos 30 dias — aquele total é histórico.'
              }
            />
          ) : (
            <LineSeries
              height={170}
              aria-label="Leads por dia dos três posts que mais trouxeram, nos últimos 30 dias"
              series={sourceCurves}
            />
          )}
        </Card>

        {/* Total sozinho não conta a história: "60 envios ontem" e "60 envios,
            sendo 50 resposta pública" são situações diferentes, e a segunda é a
            que o filtro de spam lê. Separar por tipo é o que deixa isso visível
            antes de virar restrição de conta. */}
        <Card className="mt-4 p-4">
          <div className="mb-4">
            <span className="label text-[10px] text-muted">Envios por dia, por tipo · 30 dias</span>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Resposta pública subindo mais rápido que DM é o primeiro sinal de risco — é ela que
              aparece repetida no mesmo post.
            </p>
          </div>

          <LineSeries
            height={170}
            aria-label="Envios por dia separados por tipo, nos últimos 30 dias"
            series={[
              { id: 'dm', label: 'DM', tone: 'accent', points: sendsByKind.dm },
              {
                id: 'private',
                label: 'Private reply',
                tone: 'ink',
                points: sendsByKind.privateReply,
              },
              {
                id: 'public',
                label: 'Resposta pública',
                tone: 'warning',
                points: sendsByKind.publicReply,
              },
            ]}
          />
        </Card>

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
