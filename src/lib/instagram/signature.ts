import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/**
 * A Meta assina cada POST do webhook com HMAC-SHA256 do corpo cru usando o app secret.
 * Precisa ser o corpo cru: reserializar o JSON muda os bytes e quebra a comparação.
 */
export function isValidSignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith('sha256=')) return false

  const received = Buffer.from(header.slice('sha256='.length), 'hex')
  const expected = createHmac('sha256', env.INSTAGRAM_APP_SECRET).update(rawBody, 'utf8').digest()

  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
