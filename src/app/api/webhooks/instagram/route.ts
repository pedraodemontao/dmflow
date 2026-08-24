import { after, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { checkSignature } from '@/lib/instagram/signature'
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

  const assinatura = checkSignature(rawBody, request.headers.get('x-hub-signature-256'))

  // Assinatura recusada era a ÚNICA falha do webhook que não deixava rastro:
  // saía 401 antes de qualquer log, a Meta não reclama, e o sintoma virava
  // "entrega zero sem pista". Custou não saber, por semanas, se a Meta sequer
  // estava postando. O corpo cru não vai para o log — só o tamanho e o começo
  // do hash recebido, que não revelam segredo nenhum.
  if (!assinatura.valid) {
    console.error(
      `[dm-flow] webhook recusado (${assinatura.reason}): ${rawBody.length} bytes, ` +
        `x-hub-signature-256=${request.headers.get('x-hub-signature-256')?.slice(0, 20) ?? 'ausente'}…`,
    )
    return new Response('Invalid signature', { status: 401 })
  }

  // Qual app assinou é a resposta que nem a documentação nem o painel dão. Com
  // ela no log, o segredo que não for usado pode sair da configuração.
  console.log(`[dm-flow] webhook aceito, assinado pelo app do ${assinatura.source}`)

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
