'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AtSign,
  LayoutDashboard,
  MessagesSquare,
  MessageSquarePlus,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react'

import { CommandPaletteTrigger } from '@/components/layout/command-palette'
import { ToastProvider } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Painel', icon: LayoutDashboard },
  { href: '/automacoes', label: 'Automações', icon: Zap },
  { href: '/contatos', label: 'Contatos', icon: Users },
  { href: '/conversas', label: 'Conversas', icon: MessagesSquare },
  { href: '/ice-breakers', label: 'Ice breakers', icon: MessageSquarePlus },
]

/**
 * Marca do dm-flow: dois balões — o de trás, vazado, é o comentário público;
 * o da frente, sólido em gradiente, é a DM privada que nasce dele. É o núcleo
 * do produto (comentário vira mensagem privada) desenhado como forma, em vez
 * do raio-em-quadrado genérico de qualquer app com IA. O glint no balão da
 * frente é o mesmo vocabulário do vidro usado no resto do chrome.
 */
function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} fill="none" aria-hidden="true">
      <path
        d="M3 7a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H10L6 16.5V13a4 4 0 0 1-3-3.9V7Z"
        stroke="var(--muted)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <path
        d="M11 14.5a4.5 4.5 0 0 1 4.5-4.5h6a4.5 4.5 0 0 1 4.5 4.5v2a4.5 4.5 0 0 1-4.5 4.5h-2.1L15.5 25v-3.9A4.5 4.5 0 0 1 11 16.6v-2.1Z"
        fill="url(#dmflow-mark)"
      />
      <ellipse
        cx="17.5"
        cy="13.6"
        rx="3.6"
        ry="1.3"
        fill="white"
        opacity="0.22"
        transform="rotate(-16 17.5 13.6)"
      />
      <defs>
        <linearGradient id="dmflow-mark" x1="11" y1="10" x2="26" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-soft)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Sidebar({
  username,
  tokenValid = true,
}: {
  username: string | null
  /** Falso quando a Meta recusa o token — a conta existe, mas está muda. */
  tokenValid?: boolean
}) {
  const pathname = usePathname()

  return (
    <aside className="chrome-panel flex w-60 shrink-0 flex-col border-r border-white/[0.06]">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Logomark className="size-7 shrink-0 drop-shadow-[0_2px_6px_rgb(242_118_46_/35%)]" />
        <span className="flex items-baseline gap-[3px]">
          <span className="bg-gradient-to-br from-accent to-accent-soft bg-clip-text text-base font-bold tracking-tight text-transparent">
            dm
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">flow</span>
        </span>
      </div>

      {/* O atalho ⌘K não existe para quem não sabe que ele existe: o botão é a
          única pista visível da paleta, e por isso fica antes da navegação. */}
      <div className="px-3 pb-3">
        <CommandPaletteTrigger />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {/* Item ativo: neutro (fundo + peso), não accent — o laranja fica
            reservado para a ação primária de cada tela, e este item está
            presente em toda tela ao mesmo tempo, então não pode ser "a
            marcação". Distinção vem de peso e opacidade, não de cor. */}
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                active
                  ? 'bg-white/[0.07] font-semibold text-foreground'
                  : 'text-muted hover:translate-x-0.5 hover:bg-surface-2/70 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        {username ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
              {/* Neutro quando tudo funciona — o gradiente accent aqui era
                  decoração (um avatar não é a ação principal da tela). Some
                  totalmente quando o token expira: aí vira estado real (erro),
                  e estado continua colorido. */}
              <div
                className={cn(
                  'flex size-7 items-center justify-center rounded-full',
                  tokenValid
                    ? 'bg-surface-2 ring-1 ring-inset ring-white/[0.08]'
                    : 'bg-danger/20 ring-1 ring-inset ring-danger/30',
                )}
              >
                <AtSign
                  className={cn('size-3.5', tokenValid ? 'text-foreground' : 'text-danger')}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">@{username}</p>
                <p className={cn('text-[11px]', tokenValid ? 'text-success' : 'text-danger')}>
                  {tokenValid ? 'conectado' : 'sessão expirada'}
                </p>
              </div>
            </div>

            {/* Sempre disponível: quando o token morre, é o único caminho de volta. */}
            <Link
              href="/api/auth/instagram"
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                tokenValid
                  ? 'text-muted hover:bg-surface-2/70 hover:text-foreground'
                  : 'bg-danger/15 font-medium text-danger hover:bg-danger/25',
              )}
            >
              <RefreshCw className="size-3.5" />
              Reconectar Instagram
            </Link>
          </div>
        ) : (
          <Link
            href="/api/auth/instagram"
            className="flex items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <AtSign className="size-4" />
            Conectar Instagram
          </Link>
        )}
      </div>

      {/* A fila de avisos do painel é montada aqui porque a sidebar é o único
          client component presente em toda tela do grupo `(app)` — e o layout
          do grupo é Server Component. Não desenha nada neste nó: o toast vai
          para um portal no `body`, então a posição na árvore é indiferente.
          Se um dia o provider subir para `(app)/layout.tsx`, remova esta linha
          — dois montados desenham a mesma fila duas vezes. */}
      <ToastProvider />
    </aside>
  )
}
