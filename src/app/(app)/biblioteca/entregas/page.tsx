import { Gift } from 'lucide-react'

import { BibliotecaTabs } from '@/components/biblioteca/biblioteca-tabs'
import { DeliveryRow } from '@/components/biblioteca/delivery-row'
import { Card, EmptyState } from '@/components/ui'
import { getDeliveries } from './queries'

/**
 * As entregas: o material que cada roteiro prometeu.
 *
 * A tela existe para uma decisão só — "isto está bom para ir ao ar?" — e por
 * isso é uma lista com o conteúdo dentro, não um catálogo com link para
 * detalhe. Rascunho responde 404 na rota pública, então a prévia tem que estar
 * aqui: sem ela, publicar seria a única forma de ler o que o modelo escreveu.
 *
 * O contador de visitas é o fecho do funil que nenhuma outra tela tem. O
 * Instagram conta quem viu o vídeo; `flow_node_events` conta quem andou no
 * fluxo; só `delivery_views` conta quem **abriu o que foi prometido**.
 */

export const dynamic = 'force-dynamic'

export default async function EntregasPage() {
  const deliveries = await getDeliveries()

  // Sem barra final: `APP_URL` é documentada assim em `src/lib/env.ts`, mas
  // uma barra sobrando produziria `//e/slug`, que é link quebrado com cara de
  // link certo — o tipo de erro que só aparece quando um lead reclama.
  const appUrl = process.env.APP_URL?.replace(/\/+$/, '') ?? null

  const noAr = deliveries.filter((d) => d.status === 'published').length
  const visitas = deliveries.reduce((soma, d) => soma + d.visits, 0)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <BibliotecaTabs active="entregas" />

      <div className="mt-4 mb-5">
        <h1 className="display text-3xl leading-none">Entregas</h1>
        <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-muted">
          O que o roteiro prometeu, hospedado aqui. Enquanto o material mora no nosso banco, o
          link não tem como apontar para o vazio — que é o que acontece hoje com a automação{' '}
          <span className="text-foreground">mapa</span>.
        </p>
      </div>

      {deliveries.length > 0 && (
        <div className="mb-5 flex gap-6">
          <div>
            <p className="display text-2xl leading-none">{deliveries.length}</p>
            <p className="label mt-1 text-[9px] text-muted">geradas</p>
          </div>
          <div>
            <p className="display text-2xl leading-none">{noAr}</p>
            <p className="label mt-1 text-[9px] text-muted">no ar</p>
          </div>
          <div>
            <p className="display text-2xl leading-none">{visitas}</p>
            <p className="label mt-1 text-[9px] text-muted">
              {visitas === 1 ? 'presente aberto' : 'presentes abertos'}
            </p>
          </div>
        </div>
      )}

      {deliveries.length === 0 ? (
        <EmptyState
          icon={<Gift className="size-5" />}
          title="Nenhuma entrega ainda"
          description="A entrega nasce junto do roteiro: abra a biblioteca, escolha um vídeo que passou da régua e clique em Gerar roteiro. O material que ele promete é criado aqui, em rascunho, esperando você ler e publicar."
        />
      ) : (
        <Card>
          <ul>
            {deliveries.map((delivery) => (
              <DeliveryRow
                key={delivery.id}
                delivery={delivery}
                blocks={delivery.blocks}
                appUrl={appUrl}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
