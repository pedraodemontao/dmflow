import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { PatternComposer } from '@/components/publicacoes/pattern-composer'
import { activePersona } from '@/lib/ai/carousel-context'
import { getAccount } from '@/lib/data'
import { getCommentFlows } from '../queries'

/**
 * Padrões de foto estática. O primeiro é o "tweet" — a afirmação num card de
 * post de texto, na NOSSA marca (o formato empresta a gramática, não a
 * identidade do Twitter). A página só compõe; o render é `tweet-element.tsx`.
 */

export const dynamic = 'force-dynamic'
/** A prévia renderiza um slide de verdade (satori + sharp). */
export const maxDuration = 60

export default async function PadraoPage() {
  const account = await getAccount()
  const persona = account ? await activePersona(account.id, null) : null
  const flows = await getCommentFlows()

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        href="/publicacoes"
        className="label mb-4 inline-flex items-center gap-1.5 text-[10px] text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Publicações
      </Link>

      <h1 className="display text-3xl leading-none">Padrão: tweet</h1>
      <p className="mt-2 mb-6 max-w-xl text-[11px] leading-relaxed text-muted">
        Uma afirmação forte num card de post de texto — o formato que o feed lê como opinião. Sai na
        sua paleta e tipografia, sem logotipo de terceiro e sem métrica inventada.
      </p>

      {!account ? (
        <p className="text-[11px] text-danger">Nenhuma conta do Instagram conectada.</p>
      ) : (
        <PatternComposer
          defaultName={persona?.name ?? account.username ?? ''}
          defaultHandle={account.username ?? ''}
          flows={flows}
        />
      )}
    </div>
  )
}
