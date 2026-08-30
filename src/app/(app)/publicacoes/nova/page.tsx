import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { NewPublicationForm } from '@/components/publicacoes/new-publication-form'
import { getCommentFlows } from '../queries'

/**
 * Nova publicação por upload. A página só compõe; a regra está em
 * `../actions.ts` e a decisão de publicar, no tick.
 */

export const dynamic = 'force-dynamic'

export default async function NovaPublicacaoPage() {
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

      <h1 className="display text-3xl leading-none">Nova publicação</h1>
      <p className="mt-2 mb-6 max-w-xl text-[11px] leading-relaxed text-muted">
        Imagem (JPEG ou PNG, até 8 MB, entre 4:5 e 1.91:1), carrossel de 2 a 10 imagens, ou reel em
        MP4. &ldquo;Publicar agora&rdquo; também passa pelo tick: sai em até 7 minutos.
      </p>

      <NewPublicationForm flows={flows} />
    </div>
  )
}
