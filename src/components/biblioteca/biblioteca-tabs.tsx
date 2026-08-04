import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Mesma gramática de aba do editor de automação (`STEPS`, em
 * `automation-editor.tsx`): traço limão embaixo do passo ativo, monospace
 * caixa alta. Uma só forma de aba no produto inteiro.
 */
const TABS = [
  { id: 'biblioteca', label: 'Biblioteca', href: '/biblioteca' },
  { id: 'roteiros', label: 'Roteiros', href: '/biblioteca/roteiros' },
  { id: 'entregas', label: 'Entregas', href: '/biblioteca/entregas' },
] as const

export function BibliotecaTabs({ active }: { active: (typeof TABS)[number]['id'] }) {
  return (
    <div className="flex items-stretch gap-1 self-stretch">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={active === tab.id ? 'page' : undefined}
          className={cn(
            'label flex items-center border-b-2 px-3 text-[10px] transition-colors duration-150',
            'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:outline-none',
            active === tab.id
              ? 'border-accent text-foreground'
              : 'border-transparent text-muted hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
