/**
 * Dispensar um disparo falhado: reconhecer a falha sem reprocessar.
 *
 * A marca vive no TEXTO de `flow_runs.error`; o `status` continua 'failed'.
 * Coluna nova está fora de questão (nada de migration por aqui) e nenhum outro
 * valor de `RunStatus` (src/types/db.ts) serve:
 *
 * - 'done' vira conversão: `getAutomations`/`getAutomation` contam
 *   `status = 'done'` como "concluídos" na lista de automações. Dispensar uma
 *   falha inflaria justamente a métrica que o dono usa para decidir o que
 *   funciona — o painel passaria a mentir a favor.
 * - 'running' | 'waiting_reply' | 'sleeping' entram em `getStats().runsRunning`
 *   ("em andamento") e ocupam a vaga do índice único `flow_runs_active_idx`
 *   (um fluxo ativo por contato): o disparo dispensado bloquearia gatilho novo
 *   para aquela pessoa para sempre. 'waiting_reply' ainda voltaria ao card de
 *   travados 24h depois.
 *
 * Sobra o texto do erro: não mente em métrica nenhuma, some do painel pelo
 * filtro de `src/lib/data.ts` e continua legível para quem abrir a tabela.
 *
 * O prefixo é uma palavra só de propósito: ele vira padrão de `ilike` no
 * PostgREST, e `,` `.` `:` `(` `)` ou espaço lá dentro exigiriam aspas no
 * filtro.
 */
export const DISMISSED_ERROR_PREFIX = 'DISPENSADO'

export function isDismissedError(error: string | null | undefined): boolean {
  return typeof error === 'string' && error.startsWith(DISMISSED_ERROR_PREFIX)
}

/** Dispensar é reconhecer, não apagar a pista: o erro original vai junto. */
export function markDismissed(error: string | null | undefined): string {
  if (isDismissedError(error)) return error as string
  return `${DISMISSED_ERROR_PREFIX} no painel — erro original: ${error?.trim() || 'sem detalhe'}`
}
