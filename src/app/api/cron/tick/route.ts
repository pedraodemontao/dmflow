import type { NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { refreshLongLivedToken } from '@/lib/instagram/oauth'
import { collectMediaInsights } from '@/lib/instagram/insights'
import { resumeFlow } from '@/lib/flow/engine'
import { isQuiet } from '@/lib/flow/quiet-hours'
import { assertUnderSendCap, isUnderPublicReplyCap, logSend } from '@/lib/flow/send-cap'
import { replyToComment } from '@/lib/instagram/api'
import { isPermanentError } from '@/lib/instagram/errors'
import { pollAll } from '@/lib/webhook/poll'
import { processPending } from '@/lib/webhook/process'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Account, Contact, FlowRun } from '@/types/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const STUCK_AFTER_MS = 5 * 60 * 1000
const REFRESH_WHEN_DAYS_LEFT = 10

/**
 * Evento que travou em 'processing' (deploy no meio, timeout) volta para a fila.
 *
 * Usa `process_after` — que o claim carimba com a hora atual — e NÃO
 * `created_at`. Com `created_at`, qualquer evento enfileirado há mais de 5 min
 * era considerado travado no instante em que era reclamado: dois ticks
 * sobrepostos (o de 1 min contra um tick que passou de 60s por causa de bolhas
 * ou lote grande) reprocessavam o mesmo evento e mandavam a DM duas vezes.
 */
async function requeueStuckEvents(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('webhook_events')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('process_after', new Date(Date.now() - STUCK_AFTER_MS).toISOString())
    // Mesmo teto de `MAX_ATTEMPTS` em process.ts: quem já desistiu não volta
    // sozinho — volta pelo painel, com o dono sabendo que vai reenviar.
    .lt('attempts', 12)
    .select('id')

  return data?.length ?? 0
}

/**
 * Espaçamento entre respostas públicas na mesma drenagem. Sem isto o laço
 * publica as 20 em poucos segundos — o cap limita o VOLUME, não o PADRÃO, e
 * padrão é o que o filtro de spam lê.
 */
const DRAIN_GAP_MS = 4_000

/** Linha da fila de resposta pública. Só os campos que a drenagem usa. */
interface PendingPublicReply {
  id: string
  account_id: string
  comment_id: string
  media_id: string | null
  message: string
  attempts: number
}

/** Quantas linhas por tick. Baixo de propósito: ritmo, não vazão. */
const DRAIN_BATCH = 12

/**
 * Drena a fila de respostas públicas. Todo comentário é respondido — aqui é só
 * o ritmo: sai no teto por post, espaçado, para não virar parede de comentários
 * iguais no mesmo lugar.
 *
 * A seleção sorteia a ordem entre posts em vez de puxar sempre os mais
 * antigos: um post viral com 200 pendências ocupava a janela inteira e
 * empurrava as 2 pendências de outro post para dias depois. "Nem que demore"
 * não pode virar "talvez, um dia".
 */
async function drainPublicReplies(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('pending_public_replies')
    .select('*')
    .is('sent_at', null)
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(60)

  // Uma por post por rodada, na ordem de chegada dentro de cada post. Assim
  // um post barulhento não engole a fila dos outros.
  const porPost = new Map<string, PendingPublicReply>()
  for (const row of (data ?? []) as PendingPublicReply[]) {
    const key = row.media_id ?? row.id
    if (!porPost.has(key)) porPost.set(key, row)
  }
  const lote = Array.from(porPost.values()).slice(0, DRAIN_BATCH)

  let sent = 0

  for (const row of lote) {
    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', row.account_id)
      .single()

    if (!account) continue
    const acc = account as Account
    if (acc.automations_paused || isQuiet(acc)) continue
    if (row.media_id && !(await isUnderPublicReplyCap(acc.id, row.media_id))) continue

    // Cap global FORA do try, com `continue` igual ao cap por post. Estava
    // dentro, e `SendCapError` caía no catch que incrementa `attempts` — em
    // rajada, cinco ticks seguidos com o cap estourado levavam toda a fila a
    // `attempts = 5` e ela sumia da consulta PARA SEMPRE. Adiar não é falhar:
    // o comentário volta na próxima rodada, que é a invariante do produto.
    try {
      await assertUnderSendCap(acc.id)
    } catch {
      continue
    }

    // Claim: só publica quem conseguiu marcar a linha. `maxDuration` é 300s e
    // o cron dispara a cada 60s, então até cinco ticks convivem — dois na fase
    // de drenagem liam o mesmo topo da fila e respondiam o MESMO comentário
    // duas vezes. É o incidente de 31/07 pela porta dos fundos: a migration
    // 0008 protegeu o caminho imediato e deixou a fila descoberta.
    const { data: claimed } = await supabaseAdmin
      .from('pending_public_replies')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('sent_at', null)
      .select('id')
      .maybeSingle()

    if (!claimed) continue

    try {
      await replyToComment({
        accessToken: acc.access_token,
        commentId: row.comment_id,
        message: row.message,
      })
      await logSend(acc.id, 'public_reply', row.media_id ?? undefined)

      await supabaseAdmin
        .from('pending_public_replies')
        .update({ error: null })
        .eq('id', row.id)
      sent += 1

      // Respira entre uma resposta e outra. Vinte comentários iguais no mesmo
      // segundo é assinatura de robô mesmo estando dentro do cap.
      if (lote.length > 1) await new Promise((r) => setTimeout(r, DRAIN_GAP_MS))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Devolve o claim: quem falhou de verdade volta para a fila.
      await supabaseAdmin
        .from('pending_public_replies')
        .update({
          sent_at: null,
          attempts: row.attempts + 1,
          error: message,
          // Permanente não melhora com insistência — queima o orçamento de
          // uma vez em vez de tentar cinco.
          ...(isPermanentError(error) ? { attempts: 5 } : {}),
        })
        .eq('id', row.id)
    }
  }

  return sent
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
    // Atendimento humano em curso: não retomar fluxo por cima.
    if ((contact as Contact).automation_paused) continue
    // Pânico ou fora do horário: o fluxo continua dormindo e o cron tenta depois.
    if ((account as Account).automations_paused || isQuiet(account as Account)) continue

    // Claim otimista, o mesmo padrão que `processPending` já usa em
    // `webhook_events`. `resumeFlow` virava o status sem condição — isso é
    // atribuição, não reivindicação. Dois ticks sobrepostos percorriam o mesmo
    // run e mandavam TODAS as mensagens seguintes em duplicata, e aqui não há
    // rede: são DMs comuns dentro da janela, a Meta aceita as duas. Fica mais
    // provável justamente em rajada, quando o run dorme por cap de 5 min e os
    // ticks se atrasam.
    const { data: claimed } = await supabaseAdmin
      .from('flow_runs')
      .update({ status: 'running' })
      .eq('id', row.id)
      .eq('status', 'sleeping')
      .select('id')
      .maybeSingle()

    if (!claimed) continue

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
  const publicReplies = await drainPublicReplies()

  // Métrica é acessório, entrega não: coleta de insights nunca pode responder
  // 503. Erro aqui é console.error — o 503 abaixo é exclusivo do polling.
  let mediaInsights = { collected: 0, skipped: 0 }
  try {
    mediaInsights = await collectMediaInsights()
  } catch (error) {
    console.error('[dm-flow] coleta de insights de mídia falhou:', error)
  }

  const body = { polled, requeued, processed, resumed, refreshed, publicReplies, mediaInsights }

  // Não conseguir varrer NENHUMA conta é o sistema parado, não um tick
  // tranquilo. Em 30/07 isso durou 22h reportando 200 e "succeeded" no
  // pg_cron. Responder 503 faz o job aparecer como falho no histórico,
  // que é o único lugar onde alguém olharia.
  if (polled.errors.length > 0) {
    console.error('[dm-flow] varredura falhou:', JSON.stringify(polled.errors))
    return Response.json(
      { ...body, ok: false, error: 'nao foi possivel varrer a conta no Instagram' },
      { status: 503 },
    )
  }

  return Response.json({ ...body, ok: true })
}
