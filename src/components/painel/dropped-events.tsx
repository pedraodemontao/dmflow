'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { dismissDroppedEvent, retryDroppedEvent } from '@/app/actions'
import type { DroppedEvent } from '@/lib/data'

/**
 * Comentário e DM que a fila desistiu de processar.
 *
 * Este card existe por causa de um furo real: em 30/07/2026 o token do
 * Instagram caiu por 22 horas, dois comentários queimaram as três tentativas
 * nos primeiros minutos e ficaram parados sem aparecer em lugar nenhum. A
 * invariante do projeto é que todo comentário é respondido, nem que demore —
 * comentário perdido em silêncio é pior que comentário respondido tarde,
 * porque ninguém fica sabendo.
 *
 * O orçamento de retentativa agora passa de 24h com espera crescente (ver
 * `MAX_ATTEMPTS` em `src/lib/webhook/process.ts`), então cair aqui virou caso
 * raro. Quando cai, tem que ser visível e ter saída.
 */
export function DroppedEvents({ events, total }: { events: DroppedEvent[]; total: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const result = await action()
      if (!result.ok) setErro(result.error ?? 'Não deu certo.')
      else {
        setErro(null)
        setConfirming(null)
      }
      router.refresh()
    })
  }

  const escondidos = Math.max(total - events.length, 0)

  return (
    <div>
      <ul className="mt-3 space-y-3 border-t border-danger/25 pt-3">
        {events.map((event) => (
          <li key={event.id}>
            <p className="truncate text-xs font-medium text-foreground">
              {event.kind === 'comment' ? 'Comentário' : 'Mensagem'} · {event.summary}
            </p>
            <p className="truncate text-[11px] text-muted">
              {event.attempts} tentativas · {event.error ?? 'sem detalhe do erro'}
            </p>

            {confirming === event.id ? (
              <div className="mt-2 space-y-2 rounded-sm border border-danger/40 bg-danger/10 p-2.5">
                <p className="text-[11px] leading-relaxed text-muted">
                  Reprocessar <span className="font-medium text-foreground">responde de verdade</span>{' '}
                  esse comentário no próximo tick do cron. A resposta pública que já saiu não sai de
                  novo, mas a DM sai.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => retryDroppedEvent(event.id))}
                    className="label text-[10px] text-danger hover:underline disabled:opacity-50"
                  >
                    {pending ? 'enviando…' : 'Sim, responder agora'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="label text-[10px] text-muted hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirming(event.id)}
                  className="label text-[10px] text-danger hover:underline disabled:opacity-50"
                >
                  Responder agora
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => dismissDroppedEvent(event.id))}
                  className="label text-[10px] text-muted hover:underline disabled:opacity-50"
                >
                  Dispensar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {escondidos > 0 && (
        <p className="mt-2 text-[11px] text-muted">+{escondidos} outro(s) descartado(s)</p>
      )}
      {erro && <p className="mt-2 text-[11px] text-danger">{erro}</p>}
    </div>
  )
}
