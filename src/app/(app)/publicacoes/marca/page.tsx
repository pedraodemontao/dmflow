import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { BrandForm } from '@/components/publicacoes/brand-form'
import { getAccount } from '@/lib/data'
import { loadBrandPalette } from '@/lib/render/palette'

/**
 * A marca dos slides, editável — cor sai do código e vira dado da conta
 * (migration 0023). O padrão é a QUANTIA; a instância da Beca troca as
 * cores aqui sem deploy.
 */

export const dynamic = 'force-dynamic'
/** A prévia renderiza um slide de verdade (satori + sharp). */
export const maxDuration = 60

export default async function MarcaPage() {
  const account = await getAccount()
  const palette = account ? await loadBrandPalette(account.id) : null

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        href="/publicacoes"
        className="label mb-4 inline-flex items-center gap-1.5 text-[10px] text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Publicações
      </Link>

      <h1 className="display text-3xl leading-none">Marca dos slides</h1>
      <p className="mt-2 mb-6 max-w-xl text-[11px] leading-relaxed text-muted">
        As cores e o rótulo do CTA que o render usa. A prévia é um slide de verdade, renderizado
        pelo mesmo caminho do carrossel — prévia por CSS mentiria. O acento aparece só na
        palavra-chave do CTA, de propósito: cor viva em tudo é cor viva em nada.
      </p>

      {!account || !palette ? (
        <p className="text-[11px] text-danger">Nenhuma conta do Instagram conectada.</p>
      ) : (
        <BrandForm palette={palette} />
      )}
    </div>
  )
}
