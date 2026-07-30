import { after, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { isValidSignature } from '@/lib/instagram/signature'
import { enqueue, flattenPayload, processPending } from '@/lib/webhook/process'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Handshake de verificação: a Meta chama uma vez ao cadastrar a URL do webhook. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  if (
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(params.get('hub.challenge') ?? '', { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

/**
 * A Meta exige 200 rápido, senão reentrega e acaba desativando o webhook.
 * Então: valida assinatura -> grava na fila -> responde -> processa em after().
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  if (!isValidSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 })
  }

  try {
    const payload = JSON.parse(rawBody)
    const events = flattenPayload(payload)
    await enqueue(events)

    if (events.length > 0) {
      after(async () => {
        try {
          await processPending()
        } catch (error) {
          console.error('[dm-flow] processamento em background falhou:', error)
        }
      })
    }
  } catch (error) {
    // Responder 200 mesmo assim: a fila já tem o evento e o cron recolhe.
    console.error('[dm-flow] webhook falhou ao enfileirar:', error)
  }

  return new Response('EVENT_RECEIVED', { status: 200 })
}
