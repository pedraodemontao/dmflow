import { z } from 'zod'

import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * A paleta dos slides — antes hardcoded em `slide-element.tsx`, agora dado da
 * conta (migration 0023). O padrão continua sendo a QUANTIA
 * (`docs/marca/quantia-manual.md`, seção 04): conta sem nada gravado renderiza
 * exatamente como antes.
 *
 * O schema completa com o padrão o que faltar e ignora o que sobrar — a
 * coluna `accounts.brand` nunca quebra um render. E se a migration ainda não
 * rodou, o loader cai no padrão com um `console.error`: tela nova não espera
 * migration (regra da casa).
 */

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor em hex de 6 dígitos, ex. #14181B')

export const paletteSchema = z.object({
  /** O fundo do slide. */
  paper: hex.default('#F2F0E9'),
  /** O texto. */
  ink: hex.default('#14181B'),
  /** A cor de acento — só a palavra-chave do CTA usa (regra 60-30-10 do manual). */
  accent: hex.default('#0F4C6B'),
  /** Rótulos: handle, paginação, índice de lista. */
  ruler: hex.default('#8A8476'),
  /** O rótulo do selo de CTA, acima da palavra-chave. */
  ctaLabel: z.string().min(1).max(16).default('Comenta'),
})

export type Palette = z.infer<typeof paletteSchema>

/** O padrão QUANTIA — o que todo slide era antes da 0023. */
export const QUANTIA: Palette = paletteSchema.parse({})

/** `unknown` → paleta completa. O que não passar no schema cai inteiro no padrão. */
export function parsePalette(raw: unknown): Palette {
  const parsed = paletteSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : QUANTIA
}

export async function loadBrandPalette(accountId: string): Promise<Palette> {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('brand')
    .eq('id', accountId)
    .maybeSingle()

  // Coluna que ainda não existe (migration 0023 pendente) cai aqui: padrão
  // QUANTIA e um log — o render nunca para por causa de marca.
  if (error) {
    console.error('[dm-flow] brand da conta indisponível, usando o padrão:', error.message)
    return QUANTIA
  }

  return parsePalette((data as { brand?: unknown } | null)?.brand)
}
