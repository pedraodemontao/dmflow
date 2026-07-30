import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Lock } from 'lucide-react'

import { Button, Card, Input, Label } from '@/components/ui'
import { SESSION_COOKIE, passwordMatches, signSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; para?: string }>
}) {
  const { erro, para } = await searchParams

  async function entrar(formData: FormData) {
    'use server'

    const password = process.env.PANEL_PASSWORD
    if (!password) redirect('/')

    const attempt = String(formData.get('senha') ?? '')
    const destino = String(formData.get('para') ?? '/') || '/'

    if (!passwordMatches(attempt, password)) {
      redirect(`/login?erro=1${destino !== '/' ? `&para=${encodeURIComponent(destino)}` : ''}`)
    }

    const store = await cookies()
    store.set(SESSION_COOKIE, signSession(password), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    redirect(destino.startsWith('/') ? destino : '/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent">
            <Lock className="size-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">dm-flow</h1>
            <p className="text-xs text-muted">Painel protegido</p>
          </div>
        </div>

        <form action={entrar} className="space-y-4">
          <input type="hidden" name="para" value={para ?? '/'} />
          <div>
            <Label>Senha</Label>
            <Input name="senha" type="password" autoFocus required placeholder="••••••••" />
          </div>

          {erro && (
            <p className="rounded-lg bg-danger/10 p-2.5 text-xs text-danger">Senha incorreta.</p>
          )}

          <Button type="submit" className="w-full">
            Entrar
          </Button>
        </form>
      </Card>
    </main>
  )
}
