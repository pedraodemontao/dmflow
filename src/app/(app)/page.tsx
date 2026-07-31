import Link from 'next/link'
import {
  AtSign,
  ImageOff,
  MessagesSquare,
  Play,
  TriangleAlert,
  Users,
  Zap,
} from 'lucide-react'

import { Operacao } from '@/components/painel/operacao'
import { Button, Card, EmptyState } from '@/components/ui'
import { getAccount, getAutomations, getLeadSources, getStats } from '@/lib/data'
import { checkAccountHealth } from '@/lib/instagram/health'
import { hasEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof Users
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  )
}

export default async function Home() {
  if (!hasEnv()) {
    return (
      <main className="p-8">
        <Card className="max-w-xl p-6">
          <h1 className="text-lg font-semibold">Configuração pendente</h1>
          <p className="mt-2 text-sm text-muted">
            Faltam variáveis de ambiente. Copie <code>.env.example</code> para{' '}
            <code>.env.local</code> e preencha. O passo a passo está no <code>README.md</code>.
          </p>
        </Card>
      </main>
    )
  }

  const [stats, automations, account, leadSources] = await Promise.all([
    getStats(),
    getAutomations(),
    getAccount(),
    getLeadSources(),
  ])

  const health = account ? await checkAccountHealth(account) : null

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-sm font-semibold">Painel</h1>
        <Link href="/automacoes/nova">
          <Button size="sm">
            <Zap className="size-4" />
            Nova automação
          </Button>
        </Link>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto p-6">
        {health?.status === 'token_invalido' && (
          <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-danger">
                A sessão do Instagram expirou — a automação está parada
              </p>
              <p className="mt-1 text-xs text-muted">
                Nada entra nem sai: comentário não vira lead e DM não é enviada. Acontece quando
                a senha da conta muda ou o acesso do app é revogado.
              </p>
              <p className="mt-1 text-[11px] text-muted">Resposta da Meta: {health.message}</p>
              <Link href="/api/auth/instagram" className="mt-3 inline-block">
                <Button size="sm">Reconectar agora</Button>
              </Link>
            </div>
          </div>
        )}

        {health?.status === 'sem_webhook' && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-medium text-warning">
                A conta não está inscrita nos webhooks da Meta
              </p>
              <p className="mt-1 text-xs text-muted">
                As automações continuam funcionando — a entrega é por varredura a cada minuto,
                não por webhook. Reconectar a conta refaz a inscrição, mas não é urgente.
              </p>
            </div>
          </div>
        )}

        {health?.status === 'indisponivel' && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted" />
            <div>
              <p className="text-sm font-medium">Não consegui falar com o Instagram agora</p>
              <p className="mt-1 text-xs text-muted">
                Pode ser instabilidade da Meta. Se persistir, reconecte a conta. ({health.message})
              </p>
            </div>
          </div>
        )}
        {account && (
          <Operacao
            paused={account.automations_paused}
            quietFrom={account.quiet_from}
            quietTo={account.quiet_to}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Contatos" value={stats.contacts} icon={Users} />
          <Stat label="Automações ativas" value={stats.activeAutomations} icon={Zap} />
          <Stat label="Mensagens enviadas" value={stats.messagesSent} icon={MessagesSquare} />
          <Stat label="Fluxos em andamento" value={stats.runsRunning} icon={Play} />
        </div>

        {leadSources.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-semibold">Conteúdos que mais trazem lead</h2>
            <p className="mb-3 text-xs text-muted">
              Conta só quem chegou comentando. Vale o post que trouxe a pessoa pela primeira vez.
            </p>

            <Card className="divide-y divide-border">
              {leadSources.map((source) => (
                <div key={source.mediaId} className="flex items-center gap-3 p-3">
                  {source.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={source.thumbnail}
                      alt=""
                      className="size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
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
                    className="shrink-0 text-right hover:opacity-80"
                  >
                    <p className="text-sm font-semibold tabular-nums">{source.leads}</p>
                    <p className="text-[11px] text-muted">
                      {source.leads === 1 ? 'lead' : 'leads'}
                    </p>
                  </Link>
                </div>
              ))}
            </Card>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold">Suas automações</h2>

          {automations.length === 0 ? (
            <EmptyState
              icon={<AtSign className="size-8" />}
              title="Nenhuma automação ainda"
              description="Crie a primeira: escolha um post, defina a palavra-chave e monte a sequência de DMs."
              action={
                <Link href="/automacoes/nova">
                  <Button>
                    <Zap className="size-4" />
                    Criar automação
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {automations.map(({ trigger, flow, stats: s }) => (
                <Link key={trigger.id} href={`/automacoes/${trigger.id}`}>
                  <Card className="p-4 transition-colors hover:border-muted">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{flow.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {trigger.keywords.join(', ') || 'qualquer texto'}
                        </p>
                      </div>
                      <span
                        className={
                          trigger.is_active
                            ? 'shrink-0 text-[11px] text-success'
                            : 'shrink-0 text-[11px] text-muted'
                        }
                      >
                        {trigger.is_active ? 'ativa' : 'pausada'}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-4 text-[11px] text-muted">
                      <span>{s.runs} disparos</span>
                      <span>{s.done} concluídos</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
