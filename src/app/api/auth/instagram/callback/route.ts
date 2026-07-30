import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { subscribeToWebhooks } from '@/lib/instagram/api'
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchProfile,
} from '@/lib/instagram/oauth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Atrás de um proxy (Tailscale Funnel, ngrok, Vercel) o `nextUrl.origin` é o host
 * interno — redirecionar para ele joga o usuário em `https://localhost:3001`.
 * A URI de redirecionamento já é a origem pública, então derivamos dela.
 */
function publicOrigin(): string {
  return new URL(env.INSTAGRAM_REDIRECT_URI).origin
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const home = new URL('/', publicOrigin())

  const error = params.get('error_description') ?? params.get('error')
  if (error) {
    home.searchParams.set('erro', error)
    return NextResponse.redirect(home)
  }

  const code = params.get('code')
  const state = params.get('state')
  const store = await cookies()

  if (!code || !state || state !== store.get('ig_oauth_state')?.value) {
    home.searchParams.set('erro', 'state-invalido')
    return NextResponse.redirect(home)
  }
  store.delete('ig_oauth_state')

  try {
    const shortLived = await exchangeCodeForShortLivedToken(code)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token)
    const profile = await fetchProfile(longLived.access_token)

    const { error: dbError } = await supabaseAdmin.from('accounts').upsert(
      {
        ig_user_id: String(profile.user_id ?? shortLived.user_id),
        username: profile.username ?? null,
        access_token: longLived.access_token,
        token_expires_at: new Date(Date.now() + longLived.expires_in * 1000).toISOString(),
        scopes: shortLived.permissions ?? [],
        is_active: true,
      },
      { onConflict: 'ig_user_id' },
    )

    if (dbError) throw new Error(dbError.message)

    // Sem isso a Meta não entrega nenhum evento para esta conta.
    await subscribeToWebhooks(longLived.access_token)

    home.searchParams.set('conectado', profile.username ?? 'ok')
    return NextResponse.redirect(home)
  } catch (err) {
    console.error('[dm-flow] callback do OAuth falhou:', err)
    home.searchParams.set('erro', err instanceof Error ? err.message : 'falha-no-oauth')
    return NextResponse.redirect(home)
  }
}
