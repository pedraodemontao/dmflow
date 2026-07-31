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
  const { count, error } = await supabaseAdmin
    .from('send_log')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gte('created_at', since)

  // Falha ao CONTAR não pode virar permissão para enviar. Sem este guarda,
  // qualquer instabilidade do banco devolvia count=null, `null >= cap` era
  // falso e o cap simplesmente deixava de existir — justo quando tudo está
  // ruim. Cap que falha aberto é pior que cap nenhum: dá falsa segurança.
  if (error) throw new SendCapError(env.SEND_HOURLY_CAP)

  if ((count ?? 0) >= env.SEND_HOURLY_CAP) throw new SendCapError(env.SEND_HOURLY_CAP)
}

/**
 * Teto de resposta pública POR POST. O cap global não protege do padrão que
 * derrubou a conta em 30/07: dezenas de respostas iguais no MESMO post.
 * DM vai para todos; resposta pública só para os primeiros.
 */
export async function isUnderPublicReplyCap(
  accountId: string,
  mediaId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const { count, error } = await supabaseAdmin
    .from('send_log')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('media_id', mediaId)
    .eq('kind', 'public_reply')
    .gte('created_at', since)

  // Mesma regra do cap global: na dúvida, não publica.
  if (error) return false

  return (count ?? 0) < env.PUBLIC_REPLY_PER_POST_CAP
}

export async function logSend(
  accountId: string,
  kind: SendKind,
  mediaId?: string,
): Promise<void> {
  await supabaseAdmin
    .from('send_log')
    .insert({ account_id: accountId, kind, media_id: mediaId ?? null })
}
