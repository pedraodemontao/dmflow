'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'

import {
  dismissAllFailedRuns,
  dismissFailedRun,
  retryAllFailedRuns,
  retryFailedRun,
} from '@/app/actions'
import type { FailedRun } from '@/lib/data'

/**
 * A saída do card de falhas: reenviar ou dispensar, sem abrir o banco.
 *
 * "Tentar de novo" devolve o disparo para a fila do cron e ele MANDA A DM DE
 * VERDADE — por isso o texto do botão diz isso e há uma confirmação explícita
 * antes. Ninguém pode clicar achando que é só limpar a tela.
 */

const LINE = 'text-[11px] font-medium transition-colors disabled:opacity-50'

function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Loader2 className="size-3 animate-spin" />
      {label}
    </span>
  )
}

export function FailedRuns({ runs, total }: { runs: FailedRun[]; total: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /** Id do disparo em confirmação, ou 'todos' para o lote. Null = nada aberto. */
  const [confirming, setConfirming] = useState<string | null>(null)

  const shown = runs.slice(0, 3)
  const hidden = Math.max(total - shown.length, 0)

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setError(null)
    setNote(null)
    start(async () => {
      const result = await action()
      setConfirming(null)
      if (result.ok) setNote(done ?? null)
      else setError(result.error ?? 'Não deu certo.')
      router.refresh()
    })
  }

  return (
    <>
      <ul className="mt-3 space-y-3 border-t border-danger/20 pt-3">
        {shown.map((item) => (
          <li key={item.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{item.flowName}</p>
                <p className="truncate text-[11px] text-muted">
                  {item.contactUsername ? `@${item.contactUsername} · ` : ''}
                  {item.error ?? 'sem detalhe do erro'}
                </p>
              </div>
              {item.triggerId && (
                <Link
                  href={`/automacoes/${item.triggerId}/metricas`}
                  className="shrink-0 text-[11px] font-medium text-danger hover:underline"
                >
                  ver
                </Link>
              )}
            </div>

            {confirming === item.id ? (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-2.5">
                <p className="text-[11px] text-muted">
                  Isto vai <span className="font-medium text-foreground">enviar a mensagem de
                  verdade</span> {item.contactUsername ? `para @${item.contactUsername}` : 'para o contato'} no
                  próximo tick do cron, retomando o fluxo de onde ele parou. Não é limpar a tela.
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    className={`${LINE} text-danger hover:underline`}
                    onClick={() => run(() => retryFailedRun(item.id), 'Voltou para a fila.')}
                  >
                    {pending ? <Spinner label="enviando…" /> : 'Sim, enviar de verdade'}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className={`${LINE} text-muted hover:text-foreground`}
                    onClick={() => setConfirming(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={pending}
                  className={`${LINE} text-danger hover:underline`}
                  onClick={() => setConfirming(item.id)}
                >
                  Tentar de novo (envia DM)
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={`${LINE} text-muted hover:text-foreground`}
                  onClick={() => run(() => dismissFailedRun(item.id), 'Falha dispensada.')}
                >
                  Dispensar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {hidden > 0 && <p className="mt-2 text-[11px] text-muted">+{hidden} outra(s) falha(s)</p>}

      {total > 1 && (
        <div className="mt-3 border-t border-danger/20 pt-3">
          {confirming === 'todos' ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-2.5">
              <p className="text-[11px] text-muted">
                Vai <span className="font-medium text-foreground">enviar mensagem de verdade</span>{' '}
                para as {total} pessoas desta lista, uma por uma, conforme o cron rodar. O cap de
                envios por hora segura o ritmo, mas o volume sai.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={pending}
                  className={`${LINE} text-danger hover:underline`}
                  onClick={() => run(retryAllFailedRuns, 'Lote de volta na fila.')}
                >
                  {pending ? <Spinner label="enviando…" /> : `Sim, reenviar os ${total}`}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={`${LINE} text-muted hover:text-foreground`}
                  onClick={() => setConfirming(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending}
                className={`${LINE} text-danger hover:underline`}
                onClick={() => setConfirming('todos')}
              >
                Tentar todos (envia DM)
              </button>
              <button
                type="button"
                disabled={pending}
                className={`${LINE} text-muted hover:text-foreground`}
                onClick={() => run(dismissAllFailedRuns, 'Falhas dispensadas.')}
              >
                Dispensar todos
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] font-medium text-danger">{error}</p>}
      {note && !error && <p className="mt-2 text-[11px] text-muted">{note}</p>}
    </>
  )
}
