import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Primitivos de visualização de dado da direção "Papel".
 *
 * Existem porque o painel tinha números de sobra e nenhum gráfico: risco com
 * cinco sinais de 0 a 1, funil com % por bloco, ranking de post por lead —
 * tudo apresentado como parágrafo cinza. Número em texto corrido não deixa
 * comparar; barra deixa, e é o que as referências (Koyeb, Unkey, Profound)
 * fazem em toda tela de dado.
 *
 * Sem biblioteca de gráfico de propósito. Recharts e afins trazem svg
 * arredondado, gradiente e tooltip flutuante — a gramática oposta à daqui, e
 * brigar com o estilo padrão deles daria mais trabalho que desenhar barra com
 * div. O que existe aqui é o que o produto usa; nada especulativo.
 *
 * Regra de cor que vale para os três: a menta preenche, nunca escreve. Todo
 * texto sai em tinta (`foreground`/`muted`) sobre papel, então o contraste
 * independe de qual tom a barra recebeu.
 */

type Tone = 'ink' | 'accent' | 'warning' | 'danger'

const FILL: Record<Tone, string> = {
  ink: 'bg-foreground',
  accent: 'bg-accent',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/**
 * O número como protagonista. Antes, "6 disparos falharam" era um título de
 * 13px e sumia no cinza geral; aqui o número vem em display condensada e o
 * texto vira legenda. `delta` é opcional porque só a tendência de leads tem
 * comparação com ontem — o resto é valor absoluto.
 */
export function BigNumber({
  value,
  label,
  hint,
  delta,
  tone = 'ink',
  size = 'md',
}: {
  value: ReactNode
  label: string
  hint?: ReactNode
  /** Variação já formatada (ex.: "+3" ou "−2 (−100%)"). Null/undefined esconde a linha. */
  delta?: ReactNode
  tone?: Tone
  size?: 'md' | 'lg'
}) {
  return (
    <div>
      <p className="label text-[10px] text-muted">{label}</p>
      <p
        className={cn(
          'display mt-2 tabular-nums',
          size === 'lg' ? 'text-6xl' : 'text-4xl',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </p>
      {delta && <div className="mt-2 flex items-center gap-2 text-xs text-muted">{delta}</div>}
      {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  )
}

/**
 * Barra de 0 a 1 com trilho de tinta. Serve para qualquer fração: sinal de
 * risco, taxa de conclusão, proporção de resposta pública.
 *
 * O trilho tem fio de 1px porque sobre papel um trilho só de preenchimento
 * claro desaparece — e a barra vazia precisa ser tão legível quanto a cheia,
 * senão "risco baixo" vira "componente quebrado" aos olhos de quem lê.
 */
export function Meter({
  value,
  tone = 'ink',
  className,
  'aria-label': ariaLabel,
}: {
  /** Fração de 0 a 1. Valor fora da faixa é grampeado. */
  value: number
  tone?: Tone
  className?: string
  'aria-label'?: string
}) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)

  return (
    <div
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={cn(
        'h-2.5 w-full overflow-hidden rounded-[2px] border border-foreground bg-surface-2',
        className,
      )}
    >
      <div className={cn('h-full', FILL[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export interface RankItem {
  id: string
  label: ReactNode
  /** Valor bruto — a barra é proporcional ao maior da lista, não a um teto fixo. */
  value: number
  /** Texto à direita. Sem isto, cai no próprio `value`. */
  valueLabel?: ReactNode
  tone?: Tone
  /** Miniatura opcional à esquerda (thumbnail de post, por exemplo). */
  leading?: ReactNode
}

/**
 * Lista ordenada com barra proporcional — ranking de conteúdo, funil por
 * bloco, qualquer "quem trouxe mais". A barra é relativa ao MAIOR item da
 * lista, não a um teto absoluto: o que interessa nessas telas é a comparação
 * entre as linhas, e escala fixa esmagaria tudo quando o volume é baixo.
 *
 * Quando todo mundo é zero (dia sem lead), `max` cai para 1 e nenhuma barra
 * enche — melhor que dividir por zero ou pintar tudo cheio.
 */
export function RankBars({ items, className }: { items: RankItem[]; className?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value))

  return (
    <ul className={cn('divide-y divide-border', className)}>
      {items.map((item, index) => (
        <li key={item.id} className="flex items-center gap-3 py-3">
          <span className="label w-5 shrink-0 text-[10px] text-muted tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>

          {item.leading}

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 truncate text-xs leading-snug">{item.label}</div>
            <Meter value={item.value / max} tone={item.tone ?? 'ink'} className="h-1.5" />
          </div>

          <span className="label shrink-0 text-[11px] tabular-nums">
            {item.valueLabel ?? item.value}
          </span>
        </li>
      ))}
    </ul>
  )
}
