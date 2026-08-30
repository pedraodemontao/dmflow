'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronDown, ExternalLink, Gift } from 'lucide-react'

import type { ScriptListItem } from '@/app/(app)/biblioteca/roteiros/queries'
import { ScriptView } from '@/components/biblioteca/script-view'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Um roteiro na lista.
 *
 * Fechado mostra o que decide se vale abrir — a headline e de qual vídeo do
 * acervo ele foi modelado. Aberto mostra o roteiro inteiro, com cada peça
 * copiável, porque é desta tela que o dono lê o que vai falar na câmera.
 *
 * A entrega vinculada aparece SEMPRE, mesmo fechado: roteiro cujo presente
 * ainda é rascunho é uma promessa que a DM não cumpre, e isso precisa saltar
 * antes de gravar — não depois.
 */

const ETAPA: Record<string, string> = {
  topo: 'topo de funil',
  meio: 'meio de funil',
  fundo: 'fundo de funil',
}

export function ScriptRow({ item }: { item: ScriptListItem }) {
  const [aberto, setAberto] = useState(false)

  const data = new Date(item.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <ChevronDown
          className={cn(
            'mt-1 size-4 shrink-0 text-muted transition-transform',
            aberto && 'rotate-180',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            {item.script?.headline ?? '(roteiro em formato antigo — abra para ver o que há)'}
          </p>
          <p className="label mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-muted">
            <span>{data}</span>
            <span>·</span>
            <span>{ETAPA[item.funnelStage] ?? item.funnelStage}</span>
            {item.duration && (
              <>
                <span>·</span>
                <span>{item.duration}s</span>
              </>
            )}
            {item.modeledOn?.handle && (
              <>
                <span>·</span>
                <span className="text-foreground">
                  modelado em @{item.modeledOn.handle}
                  {item.modeledOn.outlier !== null && ` (${item.modeledOn.outlier.toFixed(1)}×)`}
                </span>
              </>
            )}
          </p>
        </div>
      </button>

      {/* Card 05: o roteiro vira carrossel — mesma ideia, lida em vez de falada. */}
      {item.script && (
        <div className="px-4 pb-2 pl-11">
          <Link
            href={`/publicacoes/gerar?script=${item.id}`}
            className="label text-[10px] text-muted hover:text-foreground"
          >
            Virar carrossel →
          </Link>
        </div>
      )}

      {item.delivery && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pl-11">
          <Gift className="size-3 shrink-0 text-muted" />
          <Link
            href="/biblioteca/entregas"
            className="truncate text-[11px] text-muted hover:text-foreground"
          >
            {item.delivery.title}
          </Link>
          <Badge tone={item.delivery.status === 'published' ? 'accent' : 'warning'}>
            {item.delivery.status === 'published' ? 'presente no ar' : 'presente em rascunho'}
          </Badge>
        </div>
      )}

      {!item.delivery && (
        <p className="px-4 pb-3 pl-11 text-[11px] text-warning">
          Sem presente vinculado — a DM não tem o que entregar.
        </p>
      )}

      {aberto && (
        <div className="border-t border-border bg-surface-2 p-4">
          {/* O molde fica no TOPO do roteiro aberto, não num link perdido: a
              pergunta que o dono faz ao ler é "ficou parecido com o que
              funcionou?", e ela só se responde com os dois à vista. */}
          {item.modeledOn?.url && (
            <a
              href={item.modeledOn.url}
              target="_blank"
              rel="noreferrer"
              className="mb-4 flex items-center gap-3 rounded-sm border border-border bg-background p-3 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {item.modeledOn.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.modeledOn.thumbUrl}
                  alt=""
                  className="h-16 w-12 shrink-0 rounded-sm object-cover"
                />
              ) : (
                <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-sm border border-border text-[9px] text-muted">
                  sem capa
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="label text-[9px] text-muted">o vídeo que serviu de molde</p>
                <p className="mt-0.5 truncate text-xs text-foreground">
                  @{item.modeledOn.handle}
                  {item.modeledOn.outlier !== null && (
                    <span className="text-accent"> · {item.modeledOn.outlier.toFixed(1)}× a mediana</span>
                  )}
                  {item.modeledOn.durationSec && (
                    <span className="text-muted"> · {item.modeledOn.durationSec}s</span>
                  )}
                </p>
                {item.modeledOn.hookText && (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">
                    “{item.modeledOn.hookText}”
                  </p>
                )}
              </div>
              <ExternalLink className="size-3.5 shrink-0 text-muted" />
            </a>
          )}

          {item.script ? (
            <ScriptView script={item.script} />
          ) : (
            <p className="text-[11px] text-muted">
              Este roteiro foi gravado num formato que o schema atual não lê. O texto continua no
              banco; gere de novo pelo card da biblioteca para ter a versão nova.
            </p>
          )}
          {item.modelUsed && (
            <p className="label mt-4 text-[9px] text-muted">escrito por {item.modelUsed}</p>
          )}
        </div>
      )}
    </li>
  )
}
