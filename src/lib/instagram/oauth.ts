import { env } from '@/lib/env'

/**
 * Instagram API com Instagram Login (não exige Página do Facebook).
 * Fluxo: authorize -> code -> token curto (1h) -> token longo (60 dias) -> refresh.
 */

export const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
  'instagram_business_manage_insights',
] as const

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    redirect_uri: env.INSTAGRAM_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${params}`
}

interface ShortLivedToken {
  access_token: string
  user_id: number
  permissions: string[]
}

export async function exchangeCodeForShortLivedToken(code: string): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    client_secret: env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: env.INSTAGRAM_REDIRECT_URI,
    code,
  })

  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) throw new Error(`Troca de code falhou (${res.status}): ${await res.text()}`)
  return res.json()
}

interface LongLivedToken {
  access_token: string
  token_type: string
  expires_in: number
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: env.INSTAGRAM_APP_SECRET,
    access_token: shortLivedToken,
  })

  const res = await fetch(`https://graph.instagram.com/access_token?${params}`)
  if (!res.ok) throw new Error(`Troca por token longo falhou (${res.status}): ${await res.text()}`)
  return res.json()
}

/** Só funciona em token com mais de 24h de vida e menos de 60 dias. */
export async function refreshLongLivedToken(longLivedToken: string): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: longLivedToken,
  })

  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params}`)
  if (!res.ok) throw new Error(`Refresh de token falhou (${res.status}): ${await res.text()}`)
  return res.json()
}

export async function fetchProfile(accessToken: string) {
  const params = new URLSearchParams({
    fields: 'user_id,username,account_type',
    access_token: accessToken,
  })

  const res = await fetch(`https://graph.instagram.com/v23.0/me?${params}`)
  if (!res.ok) throw new Error(`Busca de perfil falhou (${res.status}): ${await res.text()}`)
  return res.json() as Promise<{ user_id: string; username: string; account_type?: string }>
}
