import Link from 'next/link'
import { LinkIcon, MessageCircle, Zap } from 'lucide-react'

import { AutomationActions } from '@/components/automacoes/automation-actions'
import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { Meter } from '@/components/ui/chart'
import { getAutomations } from '@/lib/data'
import { findBrokenLinks, type LinkStatus } from '@/lib/flow/link-health'

export const dynamic = 'force-dynamic'

const TRIGGER_LABEL: Record<string, string> = {
  comment: 'Comentário',
  keyword: 'DM',
  story_reply: 'Story',
  default: 'Padrão',
}

export default async function AutomacoesPage() {
  const automations = await getAutomations()

  // Checagem só das ATIVAS: automação pausada com link quebrado não está
  // perdendo ninguém, e alarmar sobre ela ensinaria a ignorar o alarme.
  //
  // `allSettled` porque uma checagem que estoure não pode derrubar a lista de
  // automações — a tela precisa abrir mesmo com a rede ruim.
  const brokenByTrigger = new Map<string, LinkStatus[]>()
  const checks = await Promise.allSettled(
    automations
      .filter(({ trigger }) => trigger.is_active)
      .map(async ({ trigger, flow }) => ({
        triggerId: trigger.id,
        broken: await findBrokenLinks(flow.definition),
      })),
  )
  for (const check of checks) {
    if (check.status === 'fulfilled' && check.value.broken.length > 0) {
      brokenByTrigger.set(check.value.triggerId, check.value.broken)
    }
  }

  return (
    <>
      <header className="chrome-panel flex h-16 shrink-0 items-center justify-between border-b px-6">
        <h1 className="display text-4xl text-foreground">Automações</h1>
        <Link href="/automacoes/nova">
          <Button size="sm" className="cta-signature">
            <Zap className="size-4" />
            Nova automação
          </Button>
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-5xl">
          {automations.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="size-8" />}
              title="Nenhuma automação"
              description="Escolha um post, defina a palavra-chave e monte a sequência de mensagens."
              action={
                <Link href="/automacoes/nova">
                  <Button className="cta-signature">Criar a primeira</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {automations.map(({ trigger, flow, stats }) => {
                const rate = stats.runs > 0 ? stats.done / stats.runs : 0
                const percent = Math.round(rate * 100)
                const blocks = Object.keys(flow.definition?.nodes ?? {}).length
                const broken = brokenByTrigger.get(trigger.id) ?? []

                return (
                  <Card key={trigger.id} className="group relative overflow-hidden">
                    <div className="flex items-center gap-4 p-4">
                    {/* Marca de caneta na borda esquerda no hover/foco. É
                        marcação, não borda: `.surface-panel` (globals.css) é
                        regra sem camada e venceria qualquer utilitário de
                        `border-color` do Tailwind, então mexer na borda do
                        Card daqui não teria efeito nenhum. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-0.5 bg-accent opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
                    />

                    <Link
                      href={`/automacoes/${trigger.id}`}
                      className="min-w-0 flex-1 rounded-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
                    >
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{flow.name}</p>
                        <Badge tone={trigger.is_active ? 'success' : 'neutral'}>
                          {trigger.is_active ? 'ativa' : 'pausada'}
                        </Badge>
                      </div>
                      <p className="mt-1.5 flex min-w-0 items-baseline gap-2">
                        <span className="label shrink-0 text-[9px] text-muted">
                          {TRIGGER_LABEL[trigger.type] ?? trigger.type}
                          {trigger.media_id ? ' · post' : ''}
                        </span>
                        <span className="truncate text-xs text-muted">
                          {trigger.keywords.join(', ') || 'qualquer texto'}
                        </span>
                      </p>
                    </Link>

                    {/* Concluídos sobre disparos é uma FRAÇÃO, não um segundo
                        número solto: em barra dá para varrer a coluna e ver
                        qual automação entrega e qual só dispara. O número
                        cru continua ali embaixo, para quem precisa do
                        volume. */}
                    <div className="hidden w-52 shrink-0 sm:block">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="label text-[9px] text-muted">
                          {stats.runs} {stats.runs === 1 ? 'disparo' : 'disparos'}
                        </span>
                        <span className="label text-[10px] tabular-nums">
                          {stats.runs > 0 ? `${percent}% até o fim` : '—'}
                        </span>
                      </div>
                      <Meter
                        value={rate}
                        className="h-1.5"
                        aria-label={`Taxa de conclusão de ${flow.name}: ${percent}%`}
                      />
                      <p className="label mt-1.5 text-[9px] text-muted tabular-nums">
                        {stats.done} concluíram · {blocks} {blocks === 1 ? 'bloco' : 'blocos'}
                      </p>
                    </div>

                      <AutomationActions
                        triggerId={trigger.id}
                        name={flow.name}
                        isActive={trigger.is_active}
                      />
                    </div>

                    {/* Faixa embaixo, não badge no título: o link quebrado não
                        é um atributo da automação, é uma ocorrência — e ela
                        precisa caber o link inteiro para o dono reconhecer
                        qual é sem abrir o fluxo. */}
                    {broken.length > 0 && (
                      <div className="border-t border-danger/40 bg-danger/10 px-4 py-2.5">
                        <p className="label flex items-center gap-1.5 text-[9px] text-danger">
                          <LinkIcon className="size-3" />
                          {broken.length === 1
                            ? 'link que o lead recebe não responde'
                            : `${broken.length} links que o lead recebe não respondem`}
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {broken.map((link) => (
                            <li key={link.url} className="text-[11px] leading-relaxed">
                              <span className="tabular-nums text-danger">
                                {link.status ?? link.motivo}
                              </span>{' '}
                              <span className="break-all text-muted">{link.url}</span>
                              {link.label && (
                                <span className="label ml-1 text-[9px] text-muted">
                                  botão “{link.label}”
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
