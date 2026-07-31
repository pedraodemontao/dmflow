import 'server-only'

import { getWebhookSubscriptions } from '@/lib/instagram/api'
import type { Account } from '@/types/db'

/**
 * Saúde da conexão com o Instagram.
 *
 * Existe porque o painel mentia: bastava haver linha em `accounts` para a
 * barra lateral dizer "conectado", mesmo com o token morto. Em 30/07/2026 o
 * token foi invalidado por troca de senha e a automação ficou 22h parada
 * enquanto a UI mostrava tudo verde.
 *
 * Token inválido é fatal — o polling usa o mesmo token, então nada entra.
 * Webhook sem assinatura NÃO é fatal: a entrega real é por polling.
 */

const GRAPH = 'https://graph.instagram.com/v23.0'

export type AccountHealth =
  | { status: 'ok'; fields: string[] }
  | { status: 'sem_webhook'; fields: string[] }
  | { status: 'token_invalido'; message: string }
  | { status: 'indisponivel'; message: string }

export async function checkAccountHealth(account: Account): Promise<AccountHealth> {
  let res: Response
  try {
    res = await fetch(`${GRAPH}/me?fields=username`, {
      headers: { authorization: `Bearer ${account.access_token}` },
      cache: 'no-store',
    })
  } catch (error) {
    return {
      status: 'indisponivel',
      message: error instanceof Error ? error.message : 'Instagram fora do ar',
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    return {
      status: 'token_invalido',
      message: body.error?.message ?? `A Meta recusou o token (HTTP ${res.status}).`,
    }
  }

  const fields = await getWebhookSubscriptions(account.access_token)
  const subscribed = fields.includes('comments') && fields.includes('messages')

  return subscribed ? { status: 'ok', fields } : { status: 'sem_webhook', fields }
}
