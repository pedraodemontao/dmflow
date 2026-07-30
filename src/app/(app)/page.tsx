import Link from 'next/link'
import { AtSign, MessagesSquare, Play, TriangleAlert, Users, Zap } from 'lucide-react'

import { Button, Card, EmptyState } from '@/components/ui'
import { getAccount, getAutomations, getStats } from '@/lib/data'
import { getWebhookSubscriptions } from '@/lib/instagram/api'
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

  const [stats, automations, account] = await Promise.all([
    getStats(),
    getAutomations(),
    getAccount(),
  ])

  // Cadastrar a URL do webhook no painel da Meta não basta: sem a conta inscrita
  // nos campos, nenhum evento é entregue e nada dispara.
  const subscriptions = account ? await getWebhookSubscriptions(account.access_token) : []
  const receivingEvents = subscriptions.includes('comments') && subscriptions.includes('messages')

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
        {account && !receivingEvents && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-medium text-warning">
                Esta conta não está recebendo eventos do Instagram
              </p>
              <p className="mt-1 text-xs text-muted">
                Nenhuma automação vai disparar. Reconecte a conta pelo botão da barra lateral —
                a inscrição nos webhooks acontece automaticamente ao conectar.
              </p>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Contatos" value={stats.contacts} icon={Users} />
          <Stat label="Automações ativas" value={stats.activeAutomations} icon={Zap} />
          <Stat label="Mensagens enviadas" value={stats.messagesSent} icon={MessagesSquare} />
          <Stat label="Fluxos em andamento" value={stats.runsRunning} icon={Play} />
        </div>

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
