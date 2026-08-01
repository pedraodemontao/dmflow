import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE, isValidSession } from '@/lib/auth'

/**
 * Rotas que precisam ficar abertas: a Meta e o cron não têm como fazer login.
 * Cada uma tem a própria autenticação — assinatura HMAC no webhook, `state` no
 * callback do OAuth e um secret no cron.
 */
const PUBLIC_PATHS = [
  '/login',
  '/privacidade',
  '/api/webhooks',
  '/api/auth/instagram',
  '/api/cron',
  // A página de captura avisa a conversão daqui; defesa é o CONVERSION_SECRET.
  '/api/conversao',
  // Página pública da entrega (o link que a DM manda). Defesa: só GET (é
  // página, sem mutação), só serve `status = 'published'` (rascunho é 404,
  // nunca 403 — 403 confirmaria que o slug existe), slug não enumerável
  // (kebab-do-título + 6 caracteres aleatórios), e não há dado sensível —
  // é material de marketing feito para ser distribuído.
  '/e',
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const password = process.env.PANEL_PASSWORD

  // Sem senha configurada o painel fica aberto — avisa no log em vez de trancar
  // o usuário para fora sem explicação.
  if (!password) {
    console.warn('[dm-flow] PANEL_PASSWORD não definida: o painel está SEM proteção.')
    return NextResponse.next()
  }

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next()
  }

  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value, password)) {
    return NextResponse.next()
  }

  const login = new URL('/login', request.url)
  if (pathname !== '/') login.searchParams.set('para', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
