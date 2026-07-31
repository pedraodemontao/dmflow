'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Radar } from 'lucide-react'

import { scrapeLibrary, type ScrapeActionResult } from '@/app/actions'
import { Button } from '@/components/ui'

/**
 * Botão que dispara a raspagem.
 *
 * Mostra o custo ANTES de rodar. O dono está no plano grátis da Apify (US$5
 * por mês) e a cobrança é por resultado — ferramenta que gasta o dinheiro dele
 * sem avisar é ferramenta que ele desliga. O número vem de medição real: 5
 * resultados custaram US$ 0,0135.
 *
 * A raspagem trabalha até um orçamento de tempo e devolve quantos perfis
 * faltam (ver `src/lib/library/scrape.ts` para o porquê — função serverless
 * tem teto de duração e morrer no meio gastaria o crédito à toa). Por isso o
 * botão continua disponível enquanto sobrar fila, e o texto diz que continuar
 * NÃO paga de novo pelo que já veio.
 */
export function RunScrape({
  custoEstimado,
  perfisAtivos,
}: {
  custoEstimado: number
  perfisAtivos: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [report, setReport] = useState<ScrapeActionResult | null>(null)

  const faltam = report?.profilesRemaining ?? 0

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        type="button"
        className="cta-signature"
        disabled={pending || perfisAtivos === 0}
        onClick={() =>
          start(async () => {
            const result = await scrapeLibrary()
            setReport(result)
            router.refresh()
          })
        }
      >
        <Radar className="size-4" />
        {pending ? 'raspando…' : faltam > 0 ? `Continuar (${faltam} na fila)` : 'Raspar agora'}
      </Button>

      <p className="label text-[9px] text-muted">
        {perfisAtivos} {perfisAtivos === 1 ? 'perfil ativo' : 'perfis ativos'} · custo estimado US${' '}
        {custoEstimado.toFixed(2)}
      </p>

      {report && (
        <p
          className={`max-w-md text-center text-[11px] leading-relaxed ${
            report.ok ? 'text-muted' : 'text-danger'
          }`}
        >
          {report.message}
          {report.received > 0 && (
            <>
              {' '}
              <span className="text-foreground">
                {report.inserted} novo(s), {report.updated} atualizado(s) · US${' '}
                {report.costUsd.toFixed(2)} gastos
              </span>
            </>
          )}
          {faltam > 0 && ' Continuar não paga de novo pelo que já veio.'}
        </p>
      )}
    </div>
  )
}
