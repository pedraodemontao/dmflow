/**
 * Núcleo do monitor de risco de flag: tipos e a regra de corte compartilhada
 * por todos os sinais. As funções deste diretório são puras — recebem número
 * e data já agregados, sem tocar banco — para dar pra testar sem Supabase. A
 * leitura mora em src/lib/data.ts.
 */

export type RiskLevel = 'verde' | 'amarelo' | 'vermelho'

export type RiskSignalId =
  | 'similaridade'
  | 'volume'
  | 'concentracao'
  | 'resposta_publica'
  | 'madrugada'

export interface RiskSignal {
  id: RiskSignalId
  /** Nome curto para o card, ex.: "Similaridade entre respostas". */
  label: string
  level: RiskLevel
  /** Valor bruto do sinal (fração de 0 a 1) — o card formata em %. */
  value: number
  /** Frase pronta em português explicando o valor e, quando cabe, o que fazer. */
  detail: string
}

export interface RiskReport {
  level: RiskLevel
  /** Do mais crítico para o menos. Empate de nível é desfeito pela ordem de prioridade dos sinais. */
  signals: RiskSignal[]
  /** O detail do sinal mais crítico, ou uma frase neutra quando tudo está verde. */
  recommendation: string
}

export interface LevelThresholds {
  /** A partir daqui (inclusive) o sinal vira amarelo. */
  amarelo: number
  /** A partir daqui (inclusive) o sinal vira vermelho. */
  vermelho: number
}

/**
 * Regra única de corte para todos os sinais: `ratio >= vermelho` vence, senão
 * `ratio >= amarelo`, senão verde. Ter uma função só evita threshold
 * divergente (`>` num sinal, `>=` noutro) por descuido.
 */
export function levelFromRatio(ratio: number, thresholds: LevelThresholds): RiskLevel {
  if (ratio >= thresholds.vermelho) return 'vermelho'
  if (ratio >= thresholds.amarelo) return 'amarelo'
  return 'verde'
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}
