'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAccount } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Mutações da biblioteca.
 *
 * Mesma ressalva de `queries.ts`: o lugar definitivo é `src/app/actions.ts`,
 * junto do resto. Estas nasceram aqui porque aquele arquivo estava ocupado por
 * outro agente — mover é recortar e colar.
 */

export interface LibraryActionResult {
  ok: boolean
  error?: string
}

const uuid = z.string().uuid()

/**
 * "Assistido" é estado DO DONO, não da raspagem: marca o que ele já olhou para
 * decidir o que modelar. Por isso mora numa coluna booleana simples e não vem
 * de lugar nenhum do pipeline — a próxima raspagem não pode desmarcar.
 */
export async function setLibraryItemWatched(
  itemId: string,
  watched: boolean,
): Promise<LibraryActionResult> {
  if (!uuid.safeParse(itemId).success) return { ok: false, error: 'Item inválido.' }

  const { error } = await supabaseAdmin
    .from('library_items')
    .update({ watched })
    .eq('id', itemId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/biblioteca')
  return { ok: true }
}

/**
 * Sem "@" e sem URL: é o que a Apify espera, e é o que faz o `unique
 * (account_id, username)` da migration 0014 realmente impedir o mesmo perfil
 * duas vezes. Colar "instagram.com/fulano/" é o erro óbvio, então a limpeza
 * acontece aqui em vez de virar recusa.
 */
const usernameSchema = z
  .string()
  .trim()
  .transform((value) =>
    value
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/[/?#].*$/, '')
      .replace(/^@/, '')
      .trim()
      .toLowerCase(),
  )
  .pipe(
    z
      .string()
      .min(1, 'Escreva o @ do perfil')
      .max(30, 'Perfil do Instagram tem no máximo 30 caracteres')
      .regex(/^[a-z0-9._]+$/, 'Use só letras, números, ponto e underline'),
  )

export async function addTrackedProfile(rawUsername: string): Promise<LibraryActionResult> {
  const parsed = usernameSchema.safeParse(rawUsername)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Perfil inválido' }
  }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  const { error } = await supabaseAdmin
    .from('tracked_profiles')
    .insert({ account_id: account.id, username: parsed.data })

  if (error) {
    // 23505 = unique_violation. O perfil já estar na lista não é falha de
    // operação, é informação — dizer "erro" aqui só confundiria.
    if (error.code === '23505') return { ok: false, error: `@${parsed.data} já está na lista.` }
    return { ok: false, error: error.message }
  }

  revalidatePath('/biblioteca')
  return { ok: true }
}
