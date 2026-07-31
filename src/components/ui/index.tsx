'use client'

import type { ComponentProps, ReactNode } from 'react'
import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Anel de foco padrão do design system — visível em qualquer superfície escura. */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        FOCUS_RING,
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        // Primário: tinta escura sobre gradiente laranja-cobre — contraste maior que
        // texto branco sobre a mesma cor (AA falha em ~4.46:1, isto passa em ~6.8:1).
        // Sombra difusa e colorida em vez de sombra dura: o botão lê como material
        // sólido erguido do fundo, não como retângulo com contorno.
        variant === 'primary' &&
          'bg-gradient-to-b from-accent to-accent-soft font-semibold text-background shadow-[0_10px_24px_-10px_rgb(242_118_46_/55%)] hover:brightness-110 hover:shadow-[0_12px_28px_-8px_rgb(242_118_46_/65%)] active:brightness-95',
        variant === 'outline' &&
          'border border-border bg-surface text-foreground hover:border-muted hover:bg-surface-2',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-foreground',
        variant === 'danger' &&
          'border border-danger/20 bg-danger/10 text-danger hover:border-danger/40 hover:bg-danger/20',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Superfície de dado padrão — opaca, nunca translúcida. Cards leem estado
 * operacional (métrica, risco, lista); profundidade vem de `.surface-panel`
 * (sombra difusa + fio de luz no topo), não de vidro. Vidro fica reservado
 * para chrome flutuante (sidebar, cabeçalhos, popovers — ver globals.css).
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('surface-panel rounded-2xl border border-border/70', className)} {...props} />
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground shadow-[inset_0_1px_0_rgb(255_255_255_/5%)] transition-colors duration-150',
        'placeholder:text-muted hover:border-muted/80',
        FOCUS_RING,
        'focus-visible:border-accent',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full resize-y rounded-xl border border-border bg-surface-2 p-3 text-sm text-foreground shadow-[inset_0_1px_0_rgb(255_255_255_/5%)] transition-colors duration-150',
        'placeholder:text-muted hover:border-muted/80',
        FOCUS_RING,
        'focus-visible:border-accent',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground shadow-[inset_0_1px_0_rgb(255_255_255_/5%)] transition-colors duration-150',
        'hover:border-muted/80',
        FOCUS_RING,
        'focus-visible:border-accent',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn(
        'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted',
        className,
      )}
      {...props}
    />
  )
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'accent'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        tone === 'neutral' && 'bg-surface-2 text-muted ring-border',
        tone === 'success' && 'bg-success/15 text-success ring-success/25',
        tone === 'warning' && 'bg-warning/15 text-warning ring-warning/25',
        tone === 'accent' && 'bg-accent/15 text-accent ring-accent/25',
      )}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          tone === 'neutral' && 'bg-muted',
          tone === 'success' && 'bg-success',
          tone === 'warning' && 'bg-warning',
          tone === 'accent' && 'bg-accent',
        )}
      />
      {children}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-surface/40 px-6 py-16 text-center">
      {icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-surface-2 text-muted shadow-[inset_0_1px_0_rgb(255_255_255_/6%)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/**
 * Iniciais do fallback do avatar. `label` normalmente é o `@` do contato —
 * uma palavra só, sem espaço — então o padrão pega as duas primeiras letras.
 * Nome com espaço ("Pedro Barros") vira a inicial das duas primeiras
 * palavras, igual ao padrão de avatar de qualquer inbox.
 */
export function getInitials(label: string): string {
  const cleaned = label.trim().replace(/^@/, '')
  if (!cleaned) return '?'

  const words = cleaned.split(/\s+/).filter(Boolean)
  const initials = words.length > 1 ? words[0][0] + words[1][0] : cleaned.slice(0, 2)

  return initials.toUpperCase()
}

const AVATAR_SIZE = {
  sm: 'size-8 text-[10px]',
  md: 'size-10 text-xs',
  lg: 'size-12 text-sm',
} as const

const AVATAR_BADGE_SIZE = {
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-4',
} as const

/**
 * Avatar com fallback para iniciais — é o caso comum: só quem já mandou DM
 * tem foto (ver `fetchContactProfile`), a maioria que só comentou não tem.
 *
 * A foto vem de uma URL assinada que EXPIRA (ver migration 0012). Em vez de
 * confiar que o que está salvo ainda carrega, o próprio `<img>` observa o
 * erro de carregamento e troca para as iniciais sem depender de nada ter
 * revalidado a tempo no servidor — rede de segurança que cobre qualquer URL
 * morta, não só a foto que nunca existiu.
 */
export function Avatar({
  src,
  label,
  size = 'md',
  verified = false,
  className,
}: {
  src?: string | null
  /** Texto usado para gerar as iniciais — normalmente `@usuario` ou o nome. */
  label: string
  size?: 'sm' | 'md' | 'lg'
  /** Selo de conta verificada, mostrado no canto do avatar. */
  verified?: boolean
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const showImage = Boolean(src) && !errored

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-semibold text-foreground ring-1 ring-inset ring-border',
        AVATAR_SIZE[size],
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? undefined}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(label)}</span>
      )}

      {verified && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-accent text-background ring-2 ring-surface',
            AVATAR_BADGE_SIZE[size],
          )}
          title="Conta verificada"
        >
          <BadgeCheck className="size-full p-px" />
        </span>
      )}
    </span>
  )
}
