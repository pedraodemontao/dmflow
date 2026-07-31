import type { NextRequest } from 'next/server'

import { getContacts } from '@/lib/data'

export const dynamic = 'force-dynamic'

/** Protegida pelo proxy: não está em PUBLIC_PATHS, então exige sessão do painel. */

const COLUMNS = [
  'usuario',
  'nome',
  'etiquetas',
  'inscrito',
  'origem',
  'origem_id',
  'janela_aberta',
  'ultima_mensagem',
  'criado_em',
] as const

/**
 * Escapa para CSV. O prefixo com aspas em `=+-@` evita que o Excel interprete
 * o valor como fórmula — um contato chamado "=cmd" não pode virar execução.
 */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const contacts = await getContacts({
    search: params.get('busca') ?? undefined,
    tag: params.get('etiqueta') ?? undefined,
    sourceId: params.get('post') ?? undefined,
    limit: 5000,
  })

  const fieldNames = [
    ...new Set(contacts.flatMap((contact) => Object.keys(contact.fields ?? {}))),
  ].sort()

  const header = [...COLUMNS, ...fieldNames].map(cell).join(',')

  const rows = contacts.map((contact) =>
    [
      contact.username ? `@${contact.username}` : contact.ig_user_id,
      contact.name,
      contact.tags.join(' | '),
      contact.subscribed ? 'sim' : 'nao',
      contact.source_type ?? '',
      contact.source_id ?? '',
      contact.windowOpen ? 'sim' : 'nao',
      contact.last_message_at ?? '',
      contact.created_at,
      ...fieldNames.map((name) => (contact.fields ?? {})[name] ?? ''),
    ]
      .map(cell)
      .join(','),
  )

  // BOM na frente para o Excel abrir acentuação corretamente.
  const csv = `﻿${[header, ...rows].join('\r\n')}`
  const today = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="contatos-${today}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
