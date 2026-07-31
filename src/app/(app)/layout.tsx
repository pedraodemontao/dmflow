import { Sidebar } from '@/components/layout/sidebar'
import { hasEnv } from '@/lib/env'
import { getAccount } from '@/lib/data'
import { checkAccountHealth } from '@/lib/instagram/health'

/** Shell do painel. Login e política de privacidade ficam fora daqui. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const account = hasEnv() ? await getAccount() : null
  const health = account ? await checkAccountHealth(account) : null

  return (
    <div className="flex min-h-screen">
      <Sidebar
        username={account?.username ?? null}
        tokenValid={health ? health.status !== 'token_invalido' : true}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
