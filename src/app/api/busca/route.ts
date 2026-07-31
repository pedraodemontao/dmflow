import type { NextRequest } from 'next/server'

import { getAutomations, getContacts } from '@/lib/data'
import { matchesQuery, stripHandle, type SearchResponse } from '@/lib/search'

export const dynamic = 'force-dynamic'

/** Protegida pelo proxy: não está em PUBLIC_PATHS, então exige sessão do painel. */

/** Abaixo disto a busca é ruído: qualquer letra sozinha traz meia base. */
const MIN_QUERY = 2
/** Ninguém busca contato com 80 caracteres — corta antes de virar ILIKE gigante. */
const MAX_QUERY = 80
const CONTACT_LIMIT = 6
const AUTOMATION_LIMIT = 5

const EMPTY: SearchResponse = { contacts: [], automations: [] }

function json(body: SearchResponse) {
  return Response.json(body, { headers: { 'cache-control': 'no-store' } })
}

/**
 * Busca da paleta de comandos (⌘K). Contato sai do mesmo `getContacts` que a
 * página `/contatos` usa — uma consulta só para os dois lugares. Automação é
 * filtrada por nome em memória: são poucas, e `getAutomations` já traz o par
 * trigger + flow que o link do builder precisa.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('q') ?? ''
  const query = stripHandle(raw).slice(0, MAX_QUERY)
  if (query.length < MIN_QUERY) return json(EMPTY)

  const [contacts, automations] = await Promise.all([
    getContacts({ search: query, limit: CONTACT_LIMIT }),
    getAutomations(),
  ])

  return json({
    contacts: contacts.map((contact) => ({
      id: contact.id,
      label: contact.username ? `@${contact.username}` : contact.ig_user_id,
      detail: contact.name,
      avatarUrl: contact.profile_pic_url ?? null,
      verified: contact.is_verified ?? false,
    })),
    automations: automations
      .filter(({ flow }) => matchesQuery(flow.name, query))
      .slice(0, AUTOMATION_LIMIT)
      .map(({ trigger, flow }) => ({
        id: trigger.id,
        name: flow.name,
        isActive: trigger.is_active,
      })),
  })
}
