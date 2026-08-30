import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { scriptSchema } from '@/lib/ai/schemas'
import { getAccount } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { CarouselComposer, type ComposerSource } from '@/components/publicacoes/carousel-composer'
import type { ContentPillar, LibraryItem, Script as ScriptRow } from '@/types/db'
import { getCommentFlows } from '../queries'

/**
 * Tema → carrossel → rascunho de publicação (card 05, fase 3).
 *
 * Chega por três portas: `?item=` (card da biblioteca), `?script=` (linha do
 * roteiro) ou nenhuma (tema livre). A página só compõe: o contexto é
 * `carousel-context.ts`, a geração é `generate-carousel.ts`, o render é
 * `render-carousel.ts`, e publicar é o card 04.
 */

export const dynamic = 'force-dynamic'
/** Geração + render de até dez slides passam de um minuto com folga. */
export const maxDuration = 120

const uuidLike = /^[0-9a-f-]{36}$/i

interface PillarOption {
  id: string
  name: string
}

async function loadPillars(accountId: string): Promise<PillarOption[]> {
  const { data: persona } = await supabaseAdmin
    .from('personas')
    .select('id')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (!persona) return []

  const { data } = await supabaseAdmin
    .from('content_pillars')
    .select('id, name')
    .eq('persona_id', (persona as { id: string }).id)
    .order('sort_order')
  return ((data ?? []) as Pick<ContentPillar, 'id' | 'name'>[]).map((p) => ({ id: p.id, name: p.name }))
}

async function loadSource(args: { item?: string; script?: string }): Promise<ComposerSource> {
  if (args.script && uuidLike.test(args.script)) {
    const { data } = await supabaseAdmin.from('scripts').select('id, output').eq('id', args.script).maybeSingle()
    const row = data as Pick<ScriptRow, 'id' | 'output'> | null
    if (row) {
      const parsed = scriptSchema.safeParse(row.output)
      return { kind: 'script', id: row.id, label: parsed.success ? parsed.data.headline : 'roteiro' }
    }
  }
  if (args.item && uuidLike.test(args.item)) {
    const { data } = await supabaseAdmin
      .from('library_items')
      .select('id, owner_handle, hook_text')
      .eq('id', args.item)
      .maybeSingle()
    const row = data as Pick<LibraryItem, 'id' | 'owner_handle' | 'hook_text'> | null
    if (row) {
      return {
        kind: 'item',
        id: row.id,
        label: `@${row.owner_handle ?? '?'}${row.hook_text ? ` — ${row.hook_text}` : ''}`,
      }
    }
  }
  return { kind: 'free', id: null, label: null }
}

export default async function GerarCarrosselPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; script?: string }>
}) {
  const params = await searchParams
  const account = await getAccount()

  const [source, pillars, flows] = await Promise.all([
    loadSource(params),
    account ? loadPillars(account.id) : Promise.resolve([]),
    getCommentFlows(),
  ])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link
        href="/publicacoes"
        className="label mb-4 inline-flex items-center gap-1.5 text-[10px] text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Publicações
      </Link>

      <h1 className="display text-3xl leading-none">Gerar carrossel</h1>
      <p className="mt-2 mb-6 max-w-xl text-[11px] leading-relaxed text-muted">
        O modelo escreve os slides; o servidor renderiza em JPEG 1080×1350 com a marca. Você edita o
        texto, renderiza de novo quantas vezes quiser sem pagar outra geração, e salva como rascunho
        — publicar é na lista.
      </p>

      {!account ? (
        <p className="text-[11px] text-danger">Nenhuma conta do Instagram conectada.</p>
      ) : (
        <CarouselComposer source={source} pillars={pillars} flows={flows} />
      )}
    </div>
  )
}
