import { notFound } from 'next/navigation'
import { cache } from 'react'

import { DeliveryBlocks } from '../blocks'
import { parseDeliveryBlocks } from '@/lib/ai/schemas'
import { verifyDeliveryToken } from '@/lib/delivery/token'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Delivery } from '@/types/db'

/**
 * A página pública da entrega — o link que a DM manda. Curta de propósito,
 * porque `/e/[slug]` é o que fica colado numa mensagem.
 *
 * Rota SEM sessão do painel: entra em `PUBLIC_PATHS` (`src/proxy.ts`), com
 * defesa própria escrita ao lado daquela entrada. Aqui dentro a defesa é:
 * só GET (Server Component não aceita mutação), só `status = 'published'`
 * (rascunho é 404, nunca 403 — 403 confirmaria que o slug existe), e slug
 * não enumerável (gerado em `src/lib/ai/slug.ts`).
 */

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ c?: string }>
}

/**
 * `cache()` deduplica a mesma consulta entre `generateMetadata` e a página —
 * as duas rodam na mesma requisição.
 */
const getPublishedDelivery = cache(async (slug: string): Promise<Delivery | null> => {
  const { data } = await supabaseAdmin
    .from('deliveries')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  return (data as Delivery | null) ?? null
})

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const delivery = await getPublishedDelivery(slug)

  return { title: delivery?.title ?? 'Entrega' }
}

/**
 * Registra a visita sem bloquear a resposta — a pessoa veio buscar o
 * presente prometido, não gerar uma linha de métrica. Erro vai para
 * `console.error`, como toda escrita de métrica do projeto.
 */
function recordView(deliveryId: string, contactId: string | null): void {
  supabaseAdmin
    .from('delivery_views')
    .insert({ delivery_id: deliveryId, contact_id: contactId })
    .then(({ error }) => {
      if (error) console.error('[delivery_views] falha ao registrar visita:', error.message)
    })
}

export default async function DeliveryPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { c: token } = await searchParams

  const delivery = await getPublishedDelivery(slug)
  if (!delivery) notFound()

  // Token ausente ou forjado NÃO bloqueia a página — só fica sem saber quem
  // abriu. Sem o segredo configurado, todo token é tratado como inválido.
  const secret = process.env.DELIVERY_TOKEN_SECRET
  const contactId = secret ? verifyDeliveryToken(token ?? null, secret) : null

  recordView(delivery.id, contactId)

  const blocks = parseDeliveryBlocks(delivery.blocks)

  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-10 sm:py-14">
      <header>
        <h1 className="display text-3xl text-foreground sm:text-4xl">{delivery.title}</h1>
        {delivery.subtitle && <p className="mt-2 text-sm text-muted">{delivery.subtitle}</p>}
      </header>
      <DeliveryBlocks blocks={blocks} />
    </main>
  )
}
