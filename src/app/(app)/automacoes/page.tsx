import Link from 'next/link'
import { MessageCircle, Zap } from 'lucide-react'

import { AutomationActions } from '@/components/automacoes/automation-actions'
import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { getAutomations } from '@/lib/data'

export const dynamic = 'force-dynamic'

const TRIGGER_LABEL: Record<string, string> = {
  comment: 'Comentário',
  keyword: 'DM',
  story_reply: 'Story',
  default: 'Padrão',
}

export default async function AutomacoesPage() {
  const automations = await getAutomations()

  return (
    <>
      <header className="chrome-panel flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
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
              {automations.map(({ trigger, flow, stats }) => (
                <Card
                  key={trigger.id}
                  className="flex items-center gap-4 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_20px_36px_-20px_rgb(0_0_0_/75%)]"
                >
                  <Link
                    href={`/automacoes/${trigger.id}`}
                    className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{flow.name}</p>
                      <Badge tone={trigger.is_active ? 'success' : 'neutral'}>
                        {trigger.is_active ? 'ativa' : 'pausada'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {TRIGGER_LABEL[trigger.type] ?? trigger.type} ·{' '}
                      {trigger.keywords.join(', ') || 'qualquer texto'}
                      {trigger.media_id ? ' · post específico' : ''}
                    </p>
                  </Link>

                  <div className="hidden shrink-0 gap-6 text-center sm:flex">
                    <div>
                      <p className="font-mono text-sm font-semibold text-foreground tabular-nums">
                        {stats.runs}
                      </p>
                      <p className="text-[11px] text-muted">disparos</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm font-semibold text-foreground tabular-nums">
                        {stats.done}
                      </p>
                      <p className="text-[11px] text-muted">concluídos</p>
                    </div>
                    <div>
                      <p className="font-mono text-sm font-semibold text-foreground tabular-nums">
                        {Object.keys(flow.definition?.nodes ?? {}).length}
                      </p>
                      <p className="text-[11px] text-muted">blocos</p>
                    </div>
                  </div>

                  <AutomationActions
                    triggerId={trigger.id}
                    name={flow.name}
                    isActive={trigger.is_active}
                  />
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
