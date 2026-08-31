'use server'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { createPublication, type PublicationActionResult } from '@/app/(app)/publicacoes/actions'
import { getAccount } from '@/lib/data'
import { PUBLICATION_MEDIA_BUCKET } from '@/lib/publications/media-url'
import { CAPTION_MAX_CHARS } from '@/lib/publications/rules'
import { loadBrandPalette } from '@/lib/render/palette'
import { renderSlide } from '@/lib/render/render-slide'
import { TWEET_NAME_MAX_CHARS, TWEET_TEXT_MAX_CHARS, tweetElement } from '@/lib/render/tweet-element'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Padrões de foto estática (31/08). O primeiro é o "tweet"; o enum existe
 * para os próximos entrarem sem mudar o contrato da tela.
 *
 * Prévia e publicação usam o MESMO render — prévia por CSS mentiria — e a
 * imagem final nasce no bucket pelo mesmo caminho de todo upload: caminho
 * construído no servidor, nunca recebido.
 */

const cardSchema = z.object({
  pattern: z.enum(['tweet']),
  name: z.string().trim().min(1).max(TWEET_NAME_MAX_CHARS),
  handle: z.string().trim().min(1).max(40).transform((value) => value.replace(/^@+/, '')),
  text: z.string().trim().min(1).max(TWEET_TEXT_MAX_CHARS),
})

export interface PatternPreviewResult {
  ok: boolean
  error?: string
  previewDataUri?: string
}

async function renderCard(raw: unknown): Promise<{ buffer: Buffer } | { error: string }> {
  const parsed = cardSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Dados inválidos.' }
  }

  const account = await getAccount()
  if (!account) return { error: 'Nenhuma conta do Instagram conectada.' }

  const palette = await loadBrandPalette(account.id)
  const buffer = await renderSlide(tweetElement(parsed.data, palette))
  return { buffer }
}

export async function previewPattern(raw: unknown): Promise<PatternPreviewResult> {
  const rendered = await renderCard(raw)
  if ('error' in rendered) return { ok: false, error: rendered.error }
  return { ok: true, previewDataUri: `data:image/jpeg;base64,${rendered.buffer.toString('base64')}` }
}

const saveSchema = z.object({
  card: z.unknown(),
  caption: z.string().max(CAPTION_MAX_CHARS),
  flowId: z.string().uuid().nullish(),
  /** ISO = entra na fila; ausente = rascunho. */
  scheduledAt: z.string().nullish(),
})

export async function savePatternPublication(raw: unknown): Promise<PublicationActionResult> {
  const parsed = saveSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

  const rendered = await renderCard(parsed.data.card)
  if ('error' in rendered) return { ok: false, error: rendered.error }

  const now = new Date()
  const mes = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const path = `uploads/${mes}/${randomUUID()}.jpg`

  const { error } = await supabaseAdmin.storage
    .from(PUBLICATION_MEDIA_BUCKET)
    .upload(path, rendered.buffer, { contentType: 'image/jpeg', upsert: false })
  if (error) return { ok: false, error: `Falha ao subir: ${error.message}` }

  return createPublication({
    kind: 'image',
    caption: parsed.data.caption,
    mediaPaths: [path],
    flowId: parsed.data.flowId ?? null,
    scheduledAt: parsed.data.scheduledAt ?? null,
  })
}
