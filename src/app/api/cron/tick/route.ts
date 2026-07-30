import type { NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { refreshLongLivedToken } from '@/lib/instagram/oauth'
import { resumeFlow } from '@/lib/flow/engine'
import { pollAll } from '@/lib/webhook/poll'
import { processPending } from '@/lib/webhook/process'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Account, Contact, FlowRun } from '@/types/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const STUCK_AFTER_MS = 5 * 60 * 1000
const REFRESH_WHEN_DAYS_LEFT = 10

/** Evento que travou em 'processing' (deploy no meio, timeout) volta para a fila. */
async function requeueStuckEvents(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('webhook_events')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('created_at', new Date(Date.now() - STUCK_AFTER_MS).toISOString())
    .lt('attempts', 3)
    .select('id')

  return data?.length ?? 0
}

/** Fluxos que estavam em nó de delay e já venceram. */
async function resumeSleepingRuns(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('flow_runs')
    .select('*')
    .eq('status', 'sleeping')
    .lte('resume_at', new Date().toISOString())
    .limit(50)

  let resumed = 0

  for (const row of (data ?? []) as FlowRun[]) {
    const [{ data: account }, { data: contact }] = await Promise.all([
      supabaseAdmin.from('accounts').select('*').eq('id', row.account_id).single(),
      supabaseAdmin.from('contacts').select('*').eq('id', row.contact_id).single(),
    ])

    if (!account || !contact) continue

    try {
      await resumeFlow({ run: row, account: account as Account, contact: contact as Contact })
      resumed += 1
    } catch (error) {
      console.error('[dm-flow] retomada de fluxo falhou:', row.id, error)
    }
  }

  return resumed
}

/** Token longo dura 60 dias. Renova faltando 10 — se deixar vencer, precisa reconectar na mão. */
async function refreshExpiringTokens(): Promise<number> {
  const threshold = new Date(Date.now() + REFRESH_WHEN_DAYS_LEFT * 24 * 60 * 60 * 1000)

  const { data } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .lt('token_expires_at', threshold.toISOString())

  let refreshed = 0

  for (const account of (data ?? []) as Account[]) {
    try {
      const token = await refreshLongLivedToken(account.access_token)
      await supabaseAdmin
        .from('accounts')
        .update({
          access_token: token.access_token,
          token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        })
        .eq('id', account.id)
      refreshed += 1
    } catch (error) {
      console.error('[dm-flow] refresh de token falhou:', account.username, error)
    }
  }

  return refreshed
}

export async function GET(request: NextRequest) {
  const authorized =
    request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}` ||
    request.nextUrl.searchParams.get('secret') === env.CRON_SECRET

  if (!authorized) return new Response('Unauthorized', { status: 401 })

  // Polling primeiro: se a entrega de webhook da Meta falhar (falha em
  // silêncio), os comentários e DMs entram na fila por aqui.
  const polled = await pollAll()

  const requeued = await requeueStuckEvents()
  const processed = await processPending(50)
  const resumed = await resumeSleepingRuns()
  const refreshed = await refreshExpiringTokens()

  return Response.json({ polled, requeued, processed, resumed, refreshed })
}
