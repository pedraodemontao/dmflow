'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AtSign, RefreshCw } from 'lucide-react'

import { CommandPaletteTrigger } from '@/components/layout/command-palette'
import { ToastProvider } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/**
 * Navegação no topo — antes era uma barra lateral escura à esquerda.
 *
 * A troca não é gosto: a rail vertical escura com ícone + rótulo é a silhueta
 * do ChatGPT e do Claude, e era metade do motivo de o produto "parecer
 * ferramenta de IA" mesmo depois de trocar cor e tipografia. As referências
 * que o dono escolheu (Unkey, Profound) põem tudo numa faixa horizontal:
 * marca à esquerda, abas no meio, ação e conta à direita. De quebra devolve
 * ~240px de largura para o conteúdo, que faz diferença no inbox e no builder.
 *
 * A aba ativa é marcada por um fio de limão embaixo, não por preenchimento —
 * é o vocabulário de aba do Unkey, e mantém o acento raro.
 */

const NAV = [
  { href: '/', label: 'Painel' },
  { href: '/automacoes', label: 'Automações' },
  { href: '/contatos', label: 'Contatos' },
  { href: '/conversas', label: 'Conversas' },
  { href: '/ice-breakers', label: 'Ice breakers' },
]

/**
 * Marca do dm-flow: dois balões — o de trás, vazado, é o comentário público;
 * o da frente, sólido, é a DM privada que nasce dele. O núcleo do produto
 * (comentário vira mensagem privada) desenhado como forma, em vez do
 * raio-em-quadrado genérico de qualquer app com IA.
 *
 * O gradiente laranja e o glint de vidro sumiram junto com a paleta antiga:
 * aqui a forma é chapada, e o único destaque é o balão da frente em limão —
 * a mesma lógica de marca-texto que vale no resto da interface.
 */
function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} fill="none" aria-hidden="true">
      <path
        d="M3 7a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H10L6 16.5V13a4 4 0 0 1-3-3.9V7Z"
        stroke="var(--muted)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M11 14.5a4.5 4.5 0 0 1 4.5-4.5h6a4.5 4.5 0 0 1 4.5 4.5v2a4.5 4.5 0 0 1-4.5 4.5h-2.1L15.5 25v-3.9A4.5 4.5 0 0 1 11 16.6v-2.1Z"
        fill="var(--accent)"
      />
    </svg>
  )
}

export function TopNav({
  username,
  tokenValid = true,
}: {
  username: string | null
  /** Falso quando a Meta recusa o token — a conta existe, mas está muda. */
  tokenValid?: boolean
}) {
  const pathname = usePathname()

  return (
    <header className="chrome-panel sticky top-0 z-30 border-b">
      <div className="flex h-14 items-center gap-6 px-5">
        <Link
          href="/"
          className="flex shrink-0 items-baseline gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Logomark className="size-6 shrink-0 self-center" />
          <span className="display text-lg leading-none">dm flow</span>
        </Link>

        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'label relative shrink-0 rounded-sm px-3 py-2 text-[10px] transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  active ? 'text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {label}
                {active && <span className="absolute inset-x-3 -bottom-px h-px bg-accent" />}
              </Link>
            )
          })}
        </nav>

        {/* O atalho ⌘K não existe para quem não sabe que ele existe: este botão
            é a única pista visível da paleta. */}
        <div className="hidden shrink-0 md:block">
          <CommandPaletteTrigger />
        </div>

        <ContaStatus username={username} tokenValid={tokenValid} />
      </div>

      {/* A fila de avisos é montada aqui porque a navegação é o único client
          component presente em toda tela do grupo `(app)` — e o layout do grupo
          é Server Component. Como a navegação não remonta na troca de rota, o
          aviso disparado antes de um `router.push` sobrevive à navegação. Não
          desenha nada neste nó: o toast vai para um portal no `body`. Se um dia
          o provider subir para `(app)/layout.tsx`, remova esta linha — dois
          montados desenham a mesma fila duas vezes. */}
      <ToastProvider />
    </header>
  )
}

/**
 * Estado da conta + reconectar. Fica sempre visível, nunca atrás de menu:
 * quando o token do Instagram cai a automação morre em silêncio, e este é o
 * único caminho de volta (aconteceu de verdade em 30/07/2026, 22 horas fora
 * do ar — ver CLAUDE.md).
 */
function ContaStatus({ username, tokenValid }: { username: string | null; tokenValid: boolean }) {
  if (!username) {
    return (
      <Link
        href="/api/auth/instagram"
        className="label flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-[10px] text-muted transition-colors duration-150 hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <AtSign className="size-3.5" />
        Conectar Instagram
      </Link>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="hidden text-right lg:block">
        <p className="text-xs font-medium text-foreground">@{username}</p>
        <p className={cn('label text-[9px]', tokenValid ? 'text-muted' : 'text-danger')}>
          {tokenValid ? 'conectado' : 'sessão expirada'}
        </p>
      </div>

      <Link
        href="/api/auth/instagram"
        title="Reconectar Instagram"
        className={cn(
          'label flex items-center gap-2 rounded-md px-3 py-2 text-[10px] transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          tokenValid
            ? 'border border-border text-muted hover:border-foreground hover:text-foreground'
            : 'border border-danger bg-danger/15 font-medium text-danger hover:bg-danger hover:text-background',
        )}
      >
        <RefreshCw className="size-3.5" />
        <span className="hidden sm:inline">Reconectar</span>
      </Link>
    </div>
  )
}
