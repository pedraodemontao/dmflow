'use client'

import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore, useTransition } from 'react'
import { Check, ChevronDown, Copy, ExternalLink, Eye, Pencil } from 'lucide-react'

import { publishDelivery } from '@/app/(app)/biblioteca/entregas/actions'
import type { DeliveryListItem } from '@/app/(app)/biblioteca/entregas/queries'
import { DeliveryBlocks } from '@/app/e/blocks'
import { DeliveryEditor } from '@/components/biblioteca/delivery-editor'
import { DeliveryLinkFlow } from '@/components/biblioteca/delivery-link-flow'
import { Badge, Button } from '@/components/ui'
import type { FlowTarget } from '@/app/(app)/biblioteca/entregas/queries'
import type { DeliveryBlock } from '@/lib/ai/schemas'
import { cn } from '@/lib/utils'

/**
 * Uma entrega na lista, com o conteúdo à mão.
 *
 * O conteúdo aparece AQUI, e não só na página pública, por um motivo de
 * sequência: rascunho responde 404 em `/e/[slug]` (é o que impede material
 * pela metade de circular). Sem prévia interna, publicar seria a única forma
 * de ler o que o modelo escreveu — ou seja, o dono só descobriria um texto
 * ruim depois de ele já estar público e já ter ido para lead em DM.
 *
 * Por isso o botão de publicar fica DEPOIS do conteúdo, não antes: a ordem da
 * tela é a ordem da decisão.
 */

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function getHash() {
  return window.location.hash
}

function getServerHash() {
  return ''
}

export function DeliveryRow({
  delivery,
  blocks,
  appUrl,
  flows,
}: {
  delivery: DeliveryListItem
  blocks: DeliveryBlock[]
  appUrl: string | null
  flows: FlowTarget[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copiado, setCopiado] = useState(false)
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // O card da biblioteca leva até aqui por `#slug`. Lido via
  // `useSyncExternalStore`, não `useEffect` + `setState`: o hash é estado de
  // um sistema externo (a URL), e essa é a forma sem re-render em cascata nem
  // divergência entre o HTML do servidor e a primeira pintura do cliente.
  const hash = useSyncExternalStore(subscribeHash, getHash, getServerHash)
  const abertoPorLink = hash === `#${delivery.slug}`
  const [manualAberto, setManualAberto] = useState<boolean | null>(null)
  const aberto = manualAberto ?? abertoPorLink

  const publicada = delivery.status === 'published'
  // Sem APP_URL configurada não dá para montar o link. Mostrar um caminho
  // relativo aqui seria pior que não mostrar: o dono copiaria "/e/slug" para
  // dentro de uma DM, onde isso não é link nenhum.
  const url = appUrl ? `${appUrl}/e/${delivery.slug}` : null

  return (
    <li id={delivery.slug} className="scroll-mt-4 border-b border-border last:border-0">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setManualAberto(!aberto)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted transition-transform',
              aberto && 'rotate-180',
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{delivery.title}</p>
            <p className="label mt-0.5 text-[9px] text-muted">
              /e/{delivery.slug}
              {delivery.visits > 0 && (
                <span className="ml-2 text-foreground">
                  <Eye className="mr-1 inline size-3" />
                  {delivery.visits} {delivery.visits === 1 ? 'visita' : 'visitas'}
                </span>
              )}
            </p>
          </div>
        </button>

        <Badge tone={publicada ? 'accent' : 'neutral'}>{publicada ? 'no ar' : 'rascunho'}</Badge>
      </div>

      {aberto && (
        <div className="border-t border-border bg-surface-2 px-4 py-4">
          {editando ? (
            <DeliveryEditor
              id={delivery.id}
              title={delivery.title}
              subtitle={delivery.subtitle}
              blocks={blocks}
              onDone={() => setEditando(false)}
            />
          ) : blocks.length === 0 ? (
            <p className="text-[11px] text-muted">
              Esta entrega está sem conteúdo — a geração falhou no meio. Gere o roteiro de novo
              pelo card da biblioteca.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-sm border border-border bg-background p-4">
              <DeliveryBlocks blocks={blocks} />
            </div>
          )}

          {!editando && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="size-3.5" />
              Editar
            </Button>

            {!publicada && blocks.length > 0 && (
              <Button
                type="button"
                size="sm"
                className="cta-signature"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await publishDelivery(delivery.id)
                    setErro(result.ok ? null : (result.error ?? 'Não deu certo.'))
                    router.refresh()
                  })
                }
              >
                {pending ? 'publicando…' : 'Publicar'}
              </Button>
            )}

            {publicada && url && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(url)
                    setCopiado(true)
                    setTimeout(() => setCopiado(false), 1500)
                  }}
                >
                  {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copiado ? 'copiado' : 'Copiar link'}
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="label flex items-center gap-1 text-[9px] text-muted hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                  abrir
                </a>
              </>
            )}

            {publicada && !url && (
              <p className="text-[11px] text-danger">
                Falta a variável <code>APP_URL</code> na Vercel — sem ela não dá para montar o
                link, e <code>{'{{presente}}'}</code> sai vazio na DM.
              </p>
            )}
          </div>
          )}

          {publicada && !editando && (
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Para a automação mandar este link, escreva{' '}
              <code className="text-foreground">{'{{presente}}'}</code> no texto do bloco e
              vincule esta entrega no editor da automação. Assim o link nunca mais some — trocar
              o material não exige mexer no fluxo.
            </p>
          )}

          {publicada && !editando && (
            <DeliveryLinkFlow deliveryId={delivery.id} flows={flows} />
          )}

          {erro && <p className="mt-2 text-[11px] text-danger">{erro}</p>}
        </div>
      )}
    </li>
  )
}
