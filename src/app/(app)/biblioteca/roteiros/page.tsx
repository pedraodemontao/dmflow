import { FileText } from 'lucide-react'

import { BibliotecaTabs } from '@/components/biblioteca/biblioteca-tabs'
import { ScriptRow } from '@/components/biblioteca/script-row'
import { Card, EmptyState } from '@/components/ui'
import { getScripts } from './queries'

/**
 * Os roteiros já gerados.
 *
 * Faltava a tela mais óbvia da biblioteca: o gerador salvava em `scripts` e não
 * havia onde ler. O roteiro ficava visível uma vez, no modal logo depois de
 * gerar, e sumia — o dono pagava a geração e perdia o acesso ao que comprou.
 *
 * É também a tela de PREPARO DE GRAVAÇÃO, e por isso o estado do presente
 * aparece em cada linha: roteiro cuja entrega ainda é rascunho promete algo
 * que a DM não cumpre, e isso tem que saltar antes de gravar.
 */

export const dynamic = 'force-dynamic'

export default async function RoteirosPage() {
  const scripts = await getScripts()

  const semPresente = scripts.filter((s) => !s.delivery || s.delivery.status !== 'published').length

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <BibliotecaTabs active="roteiros" />

      <div className="mt-4 mb-5">
        <h1 className="display text-3xl leading-none">Roteiros</h1>
        <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-muted">
          O que já foi escrito, com o vídeo do acervo que serviu de molde. Cada peça é copiável —
          gancho, roteiro, legenda e fecho.
        </p>
      </div>

      {scripts.length > 0 && (
        <div className="mb-5 flex gap-6">
          <div>
            <p className="display text-2xl leading-none">{scripts.length}</p>
            <p className="label mt-1 text-[9px] text-muted">
              {scripts.length === 1 ? 'roteiro' : 'roteiros'}
            </p>
          </div>
          {semPresente > 0 && (
            <div>
              <p className="display text-2xl leading-none text-warning">{semPresente}</p>
              <p className="label mt-1 text-[9px] text-muted">sem presente no ar</p>
            </div>
          )}
        </div>
      )}

      {scripts.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="Nenhum roteiro ainda"
          description="Abra a biblioteca, escolha um vídeo que passou da régua e clique em Gerar roteiro. Ele aparece aqui, junto do presente que promete."
        />
      ) : (
        <Card>
          <ul>
            {scripts.map((item) => (
              <ScriptRow key={item.id} item={item} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
