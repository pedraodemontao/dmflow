import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'dmflow_session'

/**
 * Cookie de sessão assinado: `<expiraEm>.<hmac>`. Não guarda a senha, e o HMAC
 * usa o próprio PANEL_PASSWORD como chave — trocar a senha invalida as sessões.
 */
export function signSession(password: string, ttlMs = 30 * 24 * 60 * 60 * 1000): string {
  const expiresAt = Date.now() + ttlMs
  const mac = createHmac('sha256', password).update(String(expiresAt)).digest('hex')
  return `${expiresAt}.${mac}`
}

export function isValidSession(value: string | undefined, password: string): boolean {
  if (!value) return false

  const [expiresAt, mac] = value.split('.')
  if (!expiresAt || !mac) return false
  if (Number(expiresAt) < Date.now()) return false

  const expected = createHmac('sha256', password).update(expiresAt).digest('hex')
  const a = Buffer.from(mac, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

/** Comparação em tempo constante, para o login não vazar a senha por timing. */
export function passwordMatches(attempt: string, password: string): boolean {
  const a = Buffer.from(attempt)
  const b = Buffer.from(password)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
