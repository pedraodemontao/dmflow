import type { NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { validateAnswer } from '@/lib/flow/validate-answer'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Contact } from '@/types/db'

export const dynamic = 'force-dynamic'

/**
 * A página avisa que o lead converteu (entrou no grupo, baixou o material).
 *
 * Serve para o fluxo não mandar mensagem de resgate para quem já entrou —
 * o nó de condição do fluxo checa a etiqueta que gravamos aqui.
 *
 * Rota pública (a página não faz login no painel), então tem defesa própria:
 * o segredo em `CONVERSION_SECRET`. Sem ele, ninguém etiqueta nada.
 *
 * Identifica a pessoa por `contact` (id que você anexa no link da DM) ou por
 * `whatsapp` (o número que ela digitou na página, comparado ao que já temos).
 */

interface Body {
  contact?: string
  whatsapp?: string
  tag?: string
  fields?: Record<string, string>
}

function unauthorized() {
  return Response.json({ ok: false, error: 'nao autorizado' }, { status: 401 })
}

export async function POST(request: NextRequest) {
  const secret =
    request.headers.get('x-conversion-secret') ?? request.nextUrl.searchParams.get('secret')

  if (!env.CONVERSION_SECRET || secret !== env.CONVERSION_SECRET) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as Body
  const tag = (body.tag ?? 'no-grupo').trim()

  let contact: Contact | null = null

  if (body.contact) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('id', body.contact)
      .maybeSingle()
    contact = (data as Contact | null) ?? null
  }

  // Sem id, tenta pelo telefone. Normaliza dos dois lados para "11999998888"
  // casar com "(11) 9 9999-8888".
  if (!contact && body.whatsapp) {
    const { ok, value } = validateAnswer('phone', body.whatsapp)
    if (!ok) return Response.json({ ok: false, error: 'whatsapp invalido' }, { status: 400 })

    const { data } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('fields->>whatsapp', value)
      .limit(1)
      .maybeSingle()
    contact = (data as Contact | null) ?? null
  }

  if (!contact) {
    return Response.json({ ok: false, error: 'contato nao encontrado' }, { status: 404 })
  }

  const tags = [...new Set([...contact.tags, tag])]
  const fields = { ...(contact.fields ?? {}), ...(body.fields ?? {}) }

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ tags, fields })
    .eq('id', contact.id)

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })

  return Response.json({ ok: true, contact: contact.id, tags })
}
