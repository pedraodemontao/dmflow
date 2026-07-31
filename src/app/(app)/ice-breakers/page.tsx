import { IceBreakers } from '@/components/painel/ice-breakers'
import { Card } from '@/components/ui'
import { getAccount } from '@/lib/data'
import { hasEnv } from '@/lib/env'
import { getIceBreakers } from '@/lib/instagram/api'
import type { IceBreaker } from '@/types/db'

export const dynamic = 'force-dynamic'

function sameIceBreakers(a: IceBreaker[], b: IceBreaker[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, i) => item.question === b[i]?.question && item.payload === b[i]?.payload)
}

export default async function IceBreakersPage() {
  const account = hasEnv() ? await getAccount() : null

  // Best-effort: se a Meta estiver fora do ar, a tela ainda funciona com o
  // que está salvo no banco — só sem o aviso de divergência.
  const live = account
    ? await getIceBreakers({ accessToken: account.access_token }).catch(() => null)
    : null
  const outOfSync = account && live ? !sameIceBreakers(account.ice_breakers, live) : false

  return (
    <>
      <header className="chrome-panel flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Ice breakers</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="canon mx-auto w-full max-w-2xl">
          {!account ? (
            <Card className="p-6">
              <p className="text-sm text-muted">
                Conecte uma conta do Instagram para configurar os ice breakers.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {outOfSync && (
                <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  O que está publicado na Meta agora é diferente do que está salvo aqui. Salve de
                  novo para sincronizar.
                </p>
              )}
              <IceBreakers
                initial={account.ice_breakers}
                syncedAt={account.ice_breakers_synced_at}
              />
            </div>
          )}
        </div>
      </main>
    </>
  )
}
