import { supabaseAdmin } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

/**
 * Teto de envios por conta por hora, contando TODO envio (DM, private reply,
 * resposta pública) via send_log. Estourou: quem chama adia — nunca derruba
 * o fluxo. Proteção anti-flag da Meta; não remover.
 */

const WINDOW_MS = 60 * 60 * 1000

export type SendKind = 'dm' | 'private_reply' | 'public_reply'

export class SendCapError extends Error {
  constructor(cap: number) {
    super(`Cap de ${cap} envios/hora atingido: envio adiado.`)
  }
}

export async function assertUnderSendCap(accountId: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('send_log')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', since)

  if ((count ?? 0) >= env.SEND_HOURLY_CAP) throw new SendCapError(env.SEND_HOURLY_CAP)
}

export async function logSend(accountId: string, kind: SendKind): Promise<void> {
  await supabaseAdmin.from('send_log').insert({ account_id: accountId, kind })
}
