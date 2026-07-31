import { Card } from '@/components/ui'
import { Meter } from '@/components/ui/chart'
import type { RiskLevel, RiskReport } from '@/lib/risk/types'
import { cn } from '@/lib/utils'

/**
 * Semáforo de risco de flag: o diferencial da ferramenta — o ManyChat não
 * avisa quando o comportamento está ficando arriscado. Só apresenta o que já
 * veio pronto de `assessRisk` (src/lib/risk); nenhuma conta acontece aqui.
 *
 * Cada `RiskSignal` traz `value`, uma fração de 0 a 1 que a versão anterior
 * jogava fora: mostrava só a palavra "Baixo"/"Atenção" no canto da linha. O
 * dado estava calculado e nunca era desenhado, então não dava para ver QUAL
 * sinal está estourando nem QUANTO — que é a única pergunta que este card
 * existe para responder. Agora cada sinal é uma barra.
 */

const LEVEL_LABEL: Record<RiskLevel, string> = {
  verde: 'Baixo',
  amarelo: 'Atenção',
  vermelho: 'Alto',
}

/** Tom da barra. `ink` no verde de propósito: risco baixo não é conquista, é o normal. */
const LEVEL_TONE: Record<RiskLevel, 'ink' | 'warning' | 'danger'> = {
  verde: 'ink',
  amarelo: 'warning',
  vermelho: 'danger',
}

const LEVEL_TEXT: Record<RiskLevel, string> = {
  verde: 'text-muted',
  amarelo: 'text-warning',
  vermelho: 'text-danger',
}

export function Risco({ report }: { report: RiskReport }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-4 border-b border-border p-4">
        <div>
          <p className="label text-[10px] text-muted">Risco de flag</p>
          <p className={cn('display mt-1.5 text-3xl', LEVEL_TEXT[report.level])}>
            {LEVEL_LABEL[report.level]}
          </p>
        </div>
        <p className="max-w-md text-right text-xs leading-relaxed text-muted">
          {report.recommendation}
        </p>
      </div>

      <ul className="divide-y divide-border">
        {report.signals.map((signal) => (
          <li key={signal.id} className="p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium">{signal.label}</span>
              <span className={cn('label shrink-0 text-[10px]', LEVEL_TEXT[signal.level])}>
                {LEVEL_LABEL[signal.level]}
              </span>
            </div>

            <Meter
              value={signal.value}
              tone={LEVEL_TONE[signal.level]}
              aria-label={`${signal.label}: ${Math.round(signal.value * 100)}%`}
              className="h-1.5"
            />

            <p className="mt-2 text-[11px] leading-relaxed text-muted">{signal.detail}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
