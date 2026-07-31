import { Gauge } from 'lucide-react'

import { Badge, Card } from '@/components/ui'
import type { RiskLevel, RiskReport } from '@/lib/risk/types'
import { cn } from '@/lib/utils'

/**
 * Semáforo de risco de flag: o diferencial da ferramenta — ManyChat não avisa
 * quando o comportamento está ficando arriscado. Só mostra o que já veio
 * pronto em `assessRisk` (src/lib/risk); esta camada é só apresentação.
 *
 * Nota de composição: o Badge do design system ainda não tem um tom
 * "vermelho" (só success/warning/neutral/accent). Para o nível vermelho, o
 * pill cai em "neutral" e a ênfase vem do próprio card (borda/fundo) e do
 * texto, reaproveitando as classes `text-danger`/`bg-danger`/`border-danger`
 * que o restante do painel já usa (ver os alertas em `src/app/(app)/page.tsx`).
 */

const LEVEL_LABEL: Record<RiskLevel, string> = {
  verde: 'Baixo',
  amarelo: 'Atenção',
  vermelho: 'Alto',
}

const LEVEL_BADGE_TONE: Record<RiskLevel, 'success' | 'warning' | 'neutral'> = {
  verde: 'success',
  amarelo: 'warning',
  vermelho: 'neutral',
}

const LEVEL_TEXT_CLASS: Record<RiskLevel, string> = {
  verde: 'text-success',
  amarelo: 'text-warning',
  vermelho: 'text-danger',
}

const CARD_ACCENT_CLASS: Record<RiskLevel, string> = {
  verde: '',
  amarelo: 'border-warning/30 bg-warning/5',
  vermelho: 'border-danger/40 bg-danger/5',
}

export function Risco({ report }: { report: RiskReport }) {
  return (
    <Card className={cn('p-4', CARD_ACCENT_CLASS[report.level])}>
      <div className="flex items-start gap-3">
        <Gauge className={cn('mt-0.5 size-4 shrink-0', LEVEL_TEXT_CLASS[report.level])} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Risco de flag</p>
            <Badge tone={LEVEL_BADGE_TONE[report.level]}>{LEVEL_LABEL[report.level]}</Badge>
          </div>

          <p className={cn('mt-2 text-xs', LEVEL_TEXT_CLASS[report.level])}>{report.recommendation}</p>

          <ul className="mt-3 space-y-2.5 border-t border-border pt-3">
            {report.signals.map((signal) => (
              <li key={signal.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium">{signal.label}</span>
                  <span
                    className={cn(
                      'shrink-0 text-[11px] font-medium tabular-nums',
                      LEVEL_TEXT_CLASS[signal.level],
                    )}
                  >
                    {LEVEL_LABEL[signal.level]}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{signal.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}
