import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Token de rastreio do link de entrega: `base64url(contact_id) + '.' + hmac`.
 * Mesmo padrão de `signSession`/`isValidSession` (`src/lib/auth.ts`), com
 * segredo PRÓPRIO (`DELIVERY_TOKEN_SECRET`, ver `src/lib/env.ts`) — são
 * superfícies diferentes: a sessão do painel autentica o dono, este token só
 * marca QUEM abriu um link público.
 *
 * NUNCA o UUID cru na URL: vaza no histórico e no referrer do navegador, e
 * qualquer um forja o de outra pessoa sem o HMAC por cima (ver Fase 3 do
 * card 01). Puro de propósito — o segredo entra por parâmetro, não lido de
 * `env`, para o teste e a página pública funcionarem sem as variáveis do
 * Instagram/Supabase (mesmo motivo do `src/lib/ai/anthropic.ts`).
 */

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

export function signDeliveryToken(contactId: string, secret: string): string {
  const payload = base64url(contactId)
  const mac = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${mac}`
}

/**
 * `null` para token ausente, malformado, forjado ou assinado com outro
 * segredo. A chamada NÃO deve usar isso para bloquear a página — só para
 * decidir se a visita grava `contact_id` ou fica anônima.
 */
export function verifyDeliveryToken(token: string | null | undefined, secret: string): string | null {
  if (!token) return null

  const [payload, mac] = token.split('.')
  if (!payload || !mac) return null

  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  const a = Buffer.from(mac, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const contactId = Buffer.from(payload, 'base64url').toString('utf8')
  return contactId || null
}
