'use client'

import type { ComponentProps, ReactNode } from 'react'
import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Anel de foco padrão. Limão: sobre preto ele chega a ~15:1, então aqui a cor
 * viva serve — diferente da revisão de base clara, onde o anel precisava ser
 * tinta. É sinal de acessibilidade, não decoração.
 */
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
        // Monospace em caixa alta espaçada: nesta direção o botão é
        // rótulo de instrumento, não frase. Raio pequeno — canto duro é parte
        // da gramática (ver globals.css).
        'label inline-flex items-center justify-center gap-2 rounded-md transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        FOCUS_RING,
        size === 'sm' ? 'h-8 px-3 text-[10px]' : 'h-10 px-4 text-[11px]',
        // Primário: branco sólido com preto por cima (~16:1), como o botão de
        // ação do Unkey e do Profound. O limão NÃO preenche botão — ele é a
        // caneta marca-texto da interface, e botão limão em toda tela mataria
        // a raridade que faz a cor funcionar. Ele aparece como sombra dura,
        // via `.cta-signature`.
        variant === 'primary' && 'bg-foreground text-background hover:bg-ink-hover',
        variant === 'outline' &&
          'border border-border bg-surface text-foreground hover:border-foreground',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-foreground',
        variant === 'danger' &&
          'border border-danger/50 bg-transparent text-danger hover:bg-danger hover:text-background',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Superfície de dado padrão. Um degrau de luminância acima do fundo,
 * delimitado por fio de cabelo — sem sombra: numa grade, o que separa um card
 * do outro é o traço, não a profundidade (ver `.surface-panel` em
 * globals.css). Raio pequeno de propósito; card arredondado com brilho era a
 * silhueta que esta direção abandonou.
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('surface-panel rounded-md', className)} {...props} />
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground transition-colors duration-150',
        // Desabilitado precisa de sinal próprio: o compositor do inbox desliga
        // sozinho quando a janela de 24h fecha, e sem isto ele fica idêntico a
        // um campo vazio esperando digitação.
        'disabled:cursor-not-allowed disabled:border-border/60 disabled:bg-surface disabled:text-muted',
        'placeholder:text-muted hover:border-muted',
        FOCUS_RING,
        'focus-visible:border-foreground',
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
        'w-full resize-y rounded-md border border-border bg-surface-2 p-3 text-sm text-foreground transition-colors duration-150',
        // Desabilitado precisa de sinal próprio: o compositor do inbox desliga
        // sozinho quando a janela de 24h fecha, e sem isto ele fica idêntico a
        // um campo vazio esperando digitação.
        'disabled:cursor-not-allowed disabled:border-border/60 disabled:bg-surface disabled:text-muted',
        'placeholder:text-muted hover:border-muted',
        FOCUS_RING,
        'focus-visible:border-foreground',
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
        'h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground transition-colors duration-150',
        // Desabilitado precisa de sinal próprio: o compositor do inbox desliga
        // sozinho quando a janela de 24h fecha, e sem isto ele fica idêntico a
        // um campo vazio esperando digitação.
        'disabled:cursor-not-allowed disabled:border-border/60 disabled:bg-surface disabled:text-muted',
        'hover:border-muted',
        FOCUS_RING,
        'focus-visible:border-foreground',
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
        'label mb-1.5 block text-[10px] text-muted',
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
        // Chip neutro com quadradinho de cor, no lugar da pílula colorida.
        // O texto sai sempre em branco sobre a superfície recuada, então o
        // contraste independe do tom; a cor vira o quadrado, que é sinal e
        // não texto. Mantém a parcimônia: badge colorido em toda linha era
        // parte do que fazia a tela parecer template.
        'label inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 py-1 text-[9.5px] text-foreground',
      )}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-[2px]',
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
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border px-6 py-16 text-center">
      {icon && (
        <div className="mb-5 flex size-14 items-center justify-center rounded-sm border border-border bg-surface-2 text-muted">
          {icon}
        </div>
      )}
      <h3 className="display text-2xl text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
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
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-2 font-mono text-foreground',
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
            'absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-[2px] bg-accent text-background ring-2 ring-surface',
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
