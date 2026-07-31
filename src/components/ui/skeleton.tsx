import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Bloco de carregamento — a peça que os `loading.tsx` do painel compõem para
 * desenhar o formato da tela que vai chegar.
 *
 * Duas decisões:
 *
 *   1. `bg-surface-2` (não um cinza inventado): o esqueleto vive dentro de
 *      `Card`/`surface-panel`, então o degrau de luminância entre ele e a
 *      superfície é o mesmo que separa qualquer par de superfícies do app.
 *   2. `motion-safe:` na pulsação. Ela é decoração — quem pediu
 *      `prefers-reduced-motion: reduce` recebe o bloco parado, que continua
 *      comunicando "isto ainda não chegou" pela forma. A regra global de
 *      `globals.css` só neutraliza `transition`, não `animation`, então a
 *      variante aqui não é redundante.
 *
 * `aria-hidden` porque leitor de tela não deve narrar retângulo nenhum — cada
 * `loading.tsx` diz "Carregando" uma vez, em texto.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-lg bg-surface-2 motion-safe:animate-pulse', className)}
      {...props}
    />
  )
}
