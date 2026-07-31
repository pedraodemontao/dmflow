import Link from 'next/link'
import { AtSign, TriangleAlert, Zap } from 'lucide-react'

import { Cockpit } from '@/components/painel/cockpit'
import { Operacao } from '@/components/painel/operacao'
import { Button, Card, EmptyState } from '@/components/ui'
import { getAccount, getAutomations, getCockpitData } from '@/lib/data'
import { checkAccountHealth } from '@/lib/instagram/health'
import { hasEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'


export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; conectado?: string }>
}) {
  const { erro, conectado } = await searchParams

  if (!hasEnv()) {
    return (
      <main className="p-8">
        <Card className="max-w-xl p-6">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Configuração pendente
          </h1>
          <p className="mt-2 text-sm text-muted">
            Faltam variáveis de ambiente. Copie <code className="font-mono text-accent">.env.example</code> para{' '}
            <code className="font-mono text-accent">.env.local</code> e preencha. O passo a passo
            está no <code className="font-mono text-accent">README.md</code>.
          </p>
        </Card>
      </main>
    )
  }

  // O cockpit já traz risco, conteúdos e filas numa chamada só — não repita
  // as leituras que ele faz.
  const [automations, account, cockpit] = await Promise.all([
    getAutomations(),
    getAccount(),
    getCockpitData(),
  ])

  const health = account ? await checkAccountHealth(account) : null

  return (
    <>
      <header className="glass-chrome flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Painel</h1>
        <Link href="/automacoes/nova">
          <Button size="sm" className="cta-signature">
            <Zap className="size-4" />
            Nova automação
          </Button>
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-6xl space-y-6">
          {/* O callback do OAuth volta para cá com ?erro= ou ?conectado=. Sem
              mostrar, uma reconexão que falhou parece ter dado certo. */}
          {erro && (
            <div className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-danger">A conexão com o Instagram falhou</p>
                <p className="mt-1 break-words text-xs text-muted">{erro}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {erro === 'state-invalido'
                    ? 'O login começou num endereço e terminou noutro. Comece sempre por dm.nocodepedro.site.'
                    : 'Se falar em URI de redirecionamento, a URL de produção precisa estar cadastrada no app do Instagram, na Meta.'}
                </p>
              </div>
            </div>
          )}

          {conectado && !erro && (
            <div className="rounded-2xl border border-success/40 bg-success/10 p-4">
              <p className="text-sm font-medium text-success">
                Instagram reconectado: @{conectado}
              </p>
            </div>
          )}

          {health?.status === 'token_invalido' && (
            <div className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4">
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
                  <Button size="sm" className="cta-signature">
                    Reconectar agora
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {health?.status === 'sem_webhook' && (
            <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
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
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-2 p-4">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <p className="text-sm font-medium">Não consegui falar com o Instagram agora</p>
                <p className="mt-1 text-xs text-muted">
                  Pode ser instabilidade da Meta. Se persistir, reconecte a conta. ({health.message})
                </p>
              </div>
            </div>
          )}
          {/* O cockpit substitui os números de vaidade: mostra o que exige AÇÃO
              (falha, gente esperando, travados) antes do que é contexto. */}
          <Cockpit data={cockpit} />

          {account && (
            <Operacao
              paused={account.automations_paused}
              quietFrom={account.quiet_from}
              quietTo={account.quiet_to}
            />
          )}

          <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">
              Suas automações
            </h2>

            {automations.length === 0 ? (
              <EmptyState
                icon={<AtSign className="size-8" />}
                title="Nenhuma automação ainda"
                description="Crie a primeira: escolha um post, defina a palavra-chave e monte a sequência de DMs."
                action={
                  <Link href="/automacoes/nova">
                    <Button className="cta-signature">
                      <Zap className="size-4" />
                      Criar automação
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {automations.map(({ trigger, flow, stats: s }) => (
                  <Link
                    key={trigger.id}
                    href={`/automacoes/${trigger.id}`}
                    className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Card className="p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_20px_36px_-20px_rgb(0_0_0_/75%)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {flow.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {trigger.keywords.join(', ') || 'qualquer texto'}
                          </p>
                        </div>
                        <span
                          className={
                            trigger.is_active
                              ? 'shrink-0 text-[11px] font-medium text-success'
                              : 'shrink-0 text-[11px] text-muted'
                          }
                        >
                          {trigger.is_active ? 'ativa' : 'pausada'}
                        </span>
                      </div>
                      <div className="mt-3 flex gap-4 font-mono text-[11px] text-muted">
                        <span>{s.runs} disparos</span>
                        <span>{s.done} concluídos</span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
