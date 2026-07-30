'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AtSign, LayoutDashboard, MessagesSquare, Users, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Painel', icon: LayoutDashboard },
  { href: '/automacoes', label: 'Automações', icon: Zap },
  { href: '/contatos', label: 'Contatos', icon: Users },
  { href: '/conversas', label: 'Conversas', icon: MessagesSquare },
]

export function Sidebar({ username }: { username: string | null }) {
  const pathname = usePathname()

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent">
          <Zap className="size-4 text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight">dm-flow</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-surface-2 font-medium text-foreground'
                  : 'text-muted hover:bg-surface-2 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-3">
        {username ? (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-amber-400">
              <AtSign className="size-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">@{username}</p>
              <p className="text-[11px] text-success">conectado</p>
            </div>
          </div>
        ) : (
          <Link
            href="/api/auth/instagram"
            className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted hover:text-foreground"
          >
            <AtSign className="size-4" />
            Conectar Instagram
          </Link>
        )}
      </div>
    </aside>
  )
}
