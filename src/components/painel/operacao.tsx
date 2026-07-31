'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, MoonStar, ShieldAlert } from 'lucide-react'

import { setAutomationsPaused, setQuietHours } from '@/app/actions'
import { Badge, Button, Card, Select } from '@/components/ui'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

export function Operacao({
  paused,
  quietFrom,
  quietTo,
}: {
  paused: boolean
  quietFrom: number | null
  quietTo: number | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState<string>(quietFrom === null ? '' : String(quietFrom))
  const [to, setTo] = useState<string>(quietTo === null ? '' : String(quietTo))

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const result = await action()
      setError(result.ok ? null : (result.error ?? 'Falhou'))
      router.refresh()
    })
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldAlert className={paused ? 'size-4 text-danger' : 'size-4 text-muted'} />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {paused ? 'Automações travadas' : 'Automações rodando'}
          </p>
          <p className="text-[11px] text-muted">
            {paused
              ? 'Nada dispara. Os comentários e DMs continuam entrando na fila e serão atendidos quando você destravar.'
              : 'Trava tudo de uma vez sem desativar automação nenhuma — destravar devolve o estado exato de antes.'}
          </p>
        </div>
        <Button
          className="ml-auto"
          size="sm"
          variant={paused ? 'primary' : 'danger'}
          disabled={pending}
          onClick={() => run(() => setAutomationsPaused(!paused))}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : paused ? 'Destravar' : 'Travar tudo'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <MoonStar className="size-4 text-muted" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Horário de silêncio</p>
          <p className="text-[11px] text-muted">
            Nada é enviado nesse intervalo — a resposta espera a abertura, o lead não se perde.
            Responder de madrugada todo dia é padrão de robô.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Select
            className="w-24"
            value={from}
            disabled={pending}
            onChange={(e) => setFrom(e.target.value)}
          >
            <option value="">desligado</option>
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}h
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted">até</span>
          <Select
            className="w-24"
            value={to}
            disabled={pending}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">desligado</option>
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}h
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() =>
                setQuietHours(from === '' ? null : Number(from), to === '' ? null : Number(to)),
              )
            }
          >
            Salvar
          </Button>
        </div>
      </div>

      {quietFrom !== null && quietTo !== null && (
        <Badge tone="neutral">
          silêncio das {String(quietFrom).padStart(2, '0')}h às {String(quietTo).padStart(2, '0')}h
          · horário de Brasília
        </Badge>
      )}

      {error && <p className="text-[11px] text-danger">{error}</p>}
    </Card>
  )
}
