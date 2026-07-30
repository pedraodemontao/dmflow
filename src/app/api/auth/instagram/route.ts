import { randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { buildAuthorizeUrl } from '@/lib/instagram/oauth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const state = randomBytes(16).toString('hex')

  const store = await cookies()
  store.set('ig_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  redirect(buildAuthorizeUrl(state))
}
