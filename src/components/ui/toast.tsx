'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck, TriangleAlert, X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Toast próprio — provider (montagem), hook (`useToast`) e componente.
 *
 * Por que a fila é um módulo e não um Context: o painel monta a sidebar num
 * layout de servidor e as telas são irmãs dela na árvore, não filhas. Context
 * só desce, então um provider montado na sidebar nunca alcançaria o inbox ou o
 * editor de contato. Com a fila no módulo, quem avisa (`useToast`) e quem
 * desenha (`ToastProvider`) não precisam ser parentes — e o aviso sobrevive à
 * troca de rota, que é justamente o caso do "Automação salva" disparado um
 * instante antes do `router.push`.
 */

export type ToastVariant = 'success' | 'error'

export interface Toast {
  id: string
  variant: ToastVariant
  message: string
  /** Milissegundos de vida. `Infinity` fica até fecharem na mão. */
  duration: number
}

export interface ToastOptions {
  duration?: number
}

/** Erro dura quase o dobro: é o que a pessoa precisa ler inteiro antes de sumir. */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  error: 7500,
}

/** Acima disto a pilha vira parede: o mais antigo sai para o novo entrar. */
const MAX_STACK = 3

const EMPTY: Toast[] = []

export function createToastStore({ max = MAX_STACK }: { max?: number } = {}) {
  let toasts: Toast[] = EMPTY
  let sequence = 0
  let paused = false

  const listeners = new Set<() => void>()
  const timers = new Map<
    string,
    { remaining: number; startedAt: number; handle: ReturnType<typeof setTimeout> | null }
  >()
  /**
   * Quem está sob o cursor agora. É um conjunto, e não um booleano, porque o
   * aviso pode sumir enquanto está com o cursor em cima (fechado no X, ou
   * empurrado para fora pelo limite da pilha) — e aí o `mouseleave` nunca
   * chega. Guardando por id, `forget` limpa a marca junto com o aviso e a fila
   * volta a contar sozinha em vez de congelar para sempre.
   */
  const hovered = new Set<string>()

  function emit() {
    for (const listener of listeners) listener()
  }

  function startTimer(id: string) {
    const timer = timers.get(id)
    if (!timer || paused || timer.handle !== null || !Number.isFinite(timer.remaining)) return
    timer.startedAt = Date.now()
    timer.handle = setTimeout(() => dismiss(id), timer.remaining)
  }

  function stopTimer(id: string) {
    const timer = timers.get(id)
    if (!timer || timer.handle === null) return
    clearTimeout(timer.handle)
    timer.handle = null
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt))
  }

  function forget(id: string) {
    const timer = timers.get(id)
    if (timer && timer.handle !== null) clearTimeout(timer.handle)
    timers.delete(id)
    hovered.delete(id)
  }

  /** Ninguém mais sob o cursor: os cronômetros que sobraram voltam a correr. */
  function releaseIfIdle() {
    if (!paused || hovered.size > 0) return
    paused = false
    for (const id of timers.keys()) startTimer(id)
  }

  function dismiss(id: string) {
    if (!timers.has(id) && !toasts.some((toast) => toast.id === id)) return
    forget(id)
    toasts = toasts.filter((toast) => toast.id !== id)
    releaseIfIdle()
    emit()
  }

  function push(variant: ToastVariant, message: string, options?: ToastOptions): string {
    const id = `toast-${(sequence += 1)}`
    const duration = options?.duration ?? DEFAULT_DURATION[variant]

    const next = [...toasts, { id, variant, message, duration }]
    for (const overflowing of next.slice(0, Math.max(0, next.length - max))) {
      forget(overflowing.id)
    }
    toasts = next.slice(-max)

    timers.set(id, { remaining: duration, startedAt: Date.now(), handle: null })
    startTimer(id)
    releaseIfIdle()
    emit()
    return id
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => toasts,
    getServerSnapshot: () => EMPTY,
    success: (message: string, options?: ToastOptions) => push('success', message, options),
    error: (message: string, options?: ToastOptions) => push('error', message, options),
    dismiss,
    /**
     * Cursor (ou foco) em cima de um aviso: a pilha inteira congela onde está.
     * Quem está lendo o de cima não perde o de baixo.
     */
    pause(id: string) {
      hovered.add(id)
      if (paused) return
      paused = true
      for (const key of timers.keys()) stopTimer(key)
    },
    resume(id: string) {
      hovered.delete(id)
      releaseIfIdle()
    },
    clear() {
      for (const id of [...timers.keys()]) forget(id)
      toasts = EMPTY
      paused = false
      emit()
    },
  }
}

export type ToastStore = ReturnType<typeof createToastStore>

const store = createToastStore()

/**
 * Emissor de avisos. Sucesso é discreto (só onde a tela não conta o resultado
 * sozinha); erro é obrigatório e carrega o motivo devolvido pela action, nunca
 * um "algo deu errado".
 */
export function useToast() {
  return store
}

const VARIANT_ICON = {
  success: CircleCheck,
  error: TriangleAlert,
} as const

/*
 * A animação de entrada mora aqui, e não em `globals.css`, porque é a única
 * coisa deste componente que não cabe num utilitário Tailwind — e mantê-la
 * junto evita que um token de toast fique órfão no arquivo global. O bloco de
 * `prefers-reduced-motion` é o par obrigatório: sem ele o aviso desliza na
 * tela de quem pediu para nada se mexer.
 */
const TOAST_CSS = `
@keyframes dmflow-toast-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.dmflow-toast { animation: dmflow-toast-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .dmflow-toast { animation: none; }
}
`

function ToastCard({ toast }: { toast: Toast }) {
  const Icon = VARIANT_ICON[toast.variant]
  const isError = toast.variant === 'error'

  return (
    <div
      className={cn(
        'dmflow-toast glass-pop pointer-events-auto flex items-start gap-2.5 rounded-2xl px-3.5 py-3',
        isError && 'ring-1 ring-inset ring-danger/30',
      )}
      // Erro interrompe o leitor de tela; sucesso espera a vez.
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => store.pause(toast.id)}
      onMouseLeave={() => store.resume(toast.id)}
      onFocusCapture={() => store.pause(toast.id)}
      onBlurCapture={() => store.resume(toast.id)}
    >
      <Icon className={cn('mt-px size-4 shrink-0', isError ? 'text-danger' : 'text-success')} />
      <p className="min-w-0 flex-1 break-words text-xs leading-relaxed text-foreground">
        {toast.message}
      </p>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => store.dismiss(toast.id)}
        className="-m-1 shrink-0 rounded-lg p-1 text-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function ToastViewport() {
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)

  // No servidor não existe `document` — e o portal não desenha nada no lugar
  // onde está montado, então sair aqui não cria divergência de hidratação: os
  // dois lados produzem o mesmo nada nesta posição da árvore.
  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: TOAST_CSS }} />
      {/* Colado no canto de baixo à direita, onde ficam os botões de ação de
          quase toda tela. No celular ocupa a largura útil; do `sm` para cima
          trava em 22rem. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-[22rem]">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </>,
    document.body,
  )
}

/**
 * Monte UMA vez dentro do grupo `(app)`. Hoje vive na sidebar (client component
 * presente em toda tela do painel); se um dia subir para o layout do grupo,
 * tire de lá — dois montados desenham a mesma fila duas vezes.
 */
export function ToastProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <ToastViewport />
    </>
  )
}
