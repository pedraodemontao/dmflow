'use server'

import { revalidatePath } from 'next/cache'

import { getAccount } from '@/lib/data'
import { paletteSchema } from '@/lib/render/palette'
import { renderSlide } from '@/lib/render/render-slide'
import { slideElement } from '@/lib/render/slide-element'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Mutações da marca dos slides (migration 0023). Salvar e prever — a prévia
 * usa o MESMO caminho do render de verdade (`slideElement` → `renderSlide`),
 * porque prévia por CSS mentiria: o satori não desenha igual ao navegador.
 */

export interface BrandActionResult {
  ok: boolean
  error?: string
  /** data URI da prévia — imagem pequena, vai inline mesmo. */
  previewDataUri?: string
}

function parse(raw: unknown) {
  const parsed = paletteSchema.safeParse(raw)
  if (parsed.success) return { palette: parsed.data, error: null }
  const issue = parsed.error.issues[0]
  return { palette: null, error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Paleta inválida.' }
}

export async function saveBrand(raw: unknown): Promise<BrandActionResult> {
  const { palette, error: parseError } = parse(raw)
  if (!palette) return { ok: false, error: parseError ?? 'Paleta inválida.' }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  const { error } = await supabaseAdmin.from('accounts').update({ brand: palette }).eq('id', account.id)
  if (error) {
    // O caso mais provável é a migration 0023 ainda não aplicada.
    return { ok: false, error: `Não salvou: ${error.message}. A migration 0023 já foi colada no SQL Editor?` }
  }

  revalidatePath('/publicacoes/marca')
  return { ok: true }
}

/** Renderiza um slide de CTA com a paleta recebida — o slide que exercita paper, ink, régua e acento de uma vez. */
export async function previewBrand(raw: unknown): Promise<BrandActionResult> {
  const { palette, error: parseError } = parse(raw)
  if (!palette) return { ok: false, error: parseError ?? 'Paleta inválida.' }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  try {
    const buffer = await renderSlide(
      slideElement(
        {
          kind: 'cta',
          layout: 'texto',
          title: 'É assim que o fechamento vai sair',
          body: 'Paper no fundo, ink no texto, régua nos rótulos e o acento só na palavra-chave.',
        },
        4,
        5,
        { handle: account.username ?? 'suaconta', ctaKeyword: 'EXEMPLO', palette },
      ),
    )
    return { ok: true, previewDataUri: `data:image/jpeg;base64,${buffer.toString('base64')}` }
  } catch (error) {
    return { ok: false, error: `Prévia falhou: ${error instanceof Error ? error.message : String(error)}` }
  }
}
