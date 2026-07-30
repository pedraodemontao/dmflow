import Link from 'next/link'
import { MessageCircle, Zap } from 'lucide-react'

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
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-sm font-semibold">Automações</h1>
        <Link href="/automacoes/nova">
          <Button size="sm">
            <Zap className="size-4" />
            Nova automação
          </Button>
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {automations.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="size-8" />}
            title="Nenhuma automação"
            description="Escolha um post, defina a palavra-chave e monte a sequência de mensagens."
            action={
              <Link href="/automacoes/nova">
                <Button>Criar a primeira</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {automations.map(({ trigger, flow, stats }) => (
              <Link key={trigger.id} href={`/automacoes/${trigger.id}`} className="block">
                <Card className="flex items-center gap-4 p-4 transition-colors hover:border-muted">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{flow.name}</p>
                      <Badge tone={trigger.is_active ? 'success' : 'neutral'}>
                        {trigger.is_active ? 'ativa' : 'pausada'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {TRIGGER_LABEL[trigger.type] ?? trigger.type} ·{' '}
                      {trigger.keywords.join(', ') || 'qualquer texto'}
                      {trigger.media_id ? ' · post específico' : ''}
                    </p>
                  </div>

                  <div className="hidden shrink-0 gap-6 text-center sm:flex">
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{stats.runs}</p>
                      <p className="text-[11px] text-muted">disparos</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{stats.done}</p>
                      <p className="text-[11px] text-muted">concluídos</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular-nums">
                        {Object.keys(flow.definition?.nodes ?? {}).length}
                      </p>
                      <p className="text-[11px] text-muted">blocos</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
