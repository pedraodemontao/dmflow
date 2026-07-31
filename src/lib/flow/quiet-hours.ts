import type { Account } from '@/types/db'

/**
 * Horário de silêncio. Serve para dois problemas de uma vez: não acordar
 * ninguém às 3h e não parecer robô — conta que responde de madrugada, todo
 * dia, no mesmo ritmo, é exatamente o padrão que a Meta sinaliza.
 *
 * O evento nunca é descartado: fica esperando a abertura.
 */

const TZ = 'America/Sao_Paulo'

function hourIn(timeZone: string, at: Date): number {
  const hour = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).format(at)

  return Number(hour) % 24
}

export function isQuiet(account: Pick<Account, 'quiet_from' | 'quiet_to'>, at = new Date()): boolean {
  const { quiet_from: from, quiet_to: to } = account
  if (from == null || to == null || from === to) return false

  const hour = hourIn(TZ, at)
  // Faixa que cruza a meia-noite (22h → 8h) precisa do OR.
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}

/** Quando o silêncio termina, para o evento ser processado na abertura. */
export function nextOpening(
  account: Pick<Account, 'quiet_from' | 'quiet_to'>,
  at = new Date(),
): Date {
  const { quiet_to: to } = account
  if (to == null) return at

  const opening = new Date(at)
  // Avança de hora em hora até sair do silêncio: evita fazer conta de fuso
  // na mão e continua correto no dia da virada de horário de verão.
  for (let step = 0; step < 48; step += 1) {
    opening.setTime(opening.getTime() + 60 * 60 * 1000)
    if (!isQuiet(account, opening)) {
      opening.setMinutes(0, 0, 0)
      return opening
    }
  }

  return opening
}
