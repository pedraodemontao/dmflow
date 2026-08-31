'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { z } from 'zod'

import { activePersona } from '@/lib/ai/carousel-context'
import { generateCaption } from '@/lib/ai/generate-caption'
import { getAccount } from '@/lib/data'
import { PUBLICATION_MEDIA_BUCKET } from '@/lib/publications/media-url'
import {
  CAPTION_MAX_CHARS,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  describeAspectProblem,
  describeStoryAspectProblem,
  isAspectAccepted,
  isStoryAspectAccepted,
  isImageType,
  isVideoType,
  jitteredScheduleAt,
} from '@/lib/publications/rules'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Publication, PublicationStatus } from '@/types/db'

/**
 * Mutações de publicação (card 04, fase 4).
 *
 * NENHUMA action chama a Meta. "Publicar agora" grava `scheduled` com
 * `scheduled_at` = agora e o tick faz o resto — é lá que moram o claim, o
 * cap, a cota, o silêncio e a retentativa. Uma action que publicasse direto
 * seria um segundo caminho para manter, e justamente o que contorna as travas.
 */

export interface PublicationActionResult {
  ok: boolean
  error?: string
  id?: string
}

const uuid = z.string().uuid()

/**
 * Caminho CONSTRUÍDO aqui, nunca recebido: nome de arquivo é dado de usuário,
 * e dado de usuário virando caminho de storage é travessia de diretório
 * esperando acontecer (mesma regra de `uploadDeliveryFile`).
 */
function mediaPath(ext: string): string {
  const now = new Date()
  const mes = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return `uploads/${mes}/${randomUUID()}.${ext}`
}

export interface UploadImageResult {
  ok: boolean
  error?: string
  path?: string
  width?: number
  height?: number
}

/**
 * Sobe uma imagem e devolve o CAMINHO no bucket.
 *
 * Valida ANTES de subir, porque o bucket é público e a Meta recusa depois,
 * no tick, horas mais tarde e sem contexto: tipo, tamanho e proporção são
 * conferidos aqui, com a mensagem apontando o que corrigir.
 *
 * PNG vira JPEG na entrada: a Meta só aceita JPEG em `image_url`, e o bucket
 * só guarda o que ela aceita. JPEG passa intacto — re-encodar só perderia
 * qualidade.
 */
export async function uploadPublicationImage(formData: FormData): Promise<UploadImageResult> {
  // 'story' valida 9:16; o resto valida a moldura do feed.
  const target = String(formData.get('target') ?? 'feed')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Escolha uma imagem.' }
  if (!isImageType(file.type)) return { ok: false, error: 'Só JPEG ou PNG.' }
  if (file.size > IMAGE_MAX_BYTES) return { ok: false, error: 'Imagem maior que 8 MB.' }

  const input = Buffer.from(await file.arrayBuffer())

  let width = 0
  let height = 0
  try {
    const meta = await sharp(input).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
  } catch {
    return { ok: false, error: 'Não consegui ler a imagem — o arquivo está íntegro?' }
  }

  if (target === 'story') {
    if (!isStoryAspectAccepted(width, height)) return { ok: false, error: describeStoryAspectProblem(width, height) }
  } else if (!isAspectAccepted(width, height)) {
    return { ok: false, error: describeAspectProblem(width, height) }
  }

  const body = file.type === 'image/png' ? await sharp(input).jpeg({ quality: 90 }).toBuffer() : input
  const path = mediaPath('jpg')

  const { error } = await supabaseAdmin.storage
    .from(PUBLICATION_MEDIA_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false })

  if (error) return { ok: false, error: `Falha ao subir: ${error.message}` }

  return { ok: true, path, width, height }
}

export interface SignedVideoUploadResult {
  ok: boolean
  error?: string
  path?: string
  signedUrl?: string
}

/**
 * Vídeo não passa pela server action: o corpo de uma action tem teto pequeno
 * (`serverActions.bodySizeLimit`), e 50 MB atravessando o servidor para
 * chegar ao mesmo bucket é desperdício. A action só prepara uma URL de upload
 * assinada; o navegador faz `PUT` direto nela. A `service_role` nunca vai ao
 * navegador — a URL vale para UM caminho, por tempo limitado.
 */
export async function createSignedVideoUpload(args: {
  contentType: string
  sizeBytes: number
}): Promise<SignedVideoUploadResult> {
  if (!isVideoType(args.contentType)) return { ok: false, error: 'Só MP4 ou MOV.' }
  if (args.sizeBytes <= 0 || args.sizeBytes > VIDEO_MAX_BYTES) {
    return { ok: false, error: 'Vídeo maior que 100 MB.' }
  }

  const path = mediaPath(args.contentType === 'video/quicktime' ? 'mov' : 'mp4')
  const { data, error } = await supabaseAdmin.storage
    .from(PUBLICATION_MEDIA_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    return { ok: false, error: `Falha ao preparar o upload: ${error?.message ?? 'sem resposta'}` }
  }

  return { ok: true, path, signedUrl: data.signedUrl }
}

/** Só caminhos que este app produz: o upload da tela ou o render do card 05. */
const mediaPathSchema = z.string().regex(/^(uploads|carousel)\/[A-Za-z0-9._/-]+$/, 'Caminho de mídia inválido')

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida')

const createSchema = z
  .object({
    kind: z.enum(['image', 'carousel', 'reel', 'story']),
    // Story não leva legenda — a API ignora; exigir vazio evita o dono escrever à toa.
    caption: z.string().max(CAPTION_MAX_CHARS, `Legenda acima de ${CAPTION_MAX_CHARS} caracteres`),
    mediaPaths: z.array(mediaPathSchema).min(1, 'Escolha a mídia'),
    coverPath: mediaPathSchema.nullish(),
    /** Ausente = rascunho. Presente = entra na fila do tick. */
    scheduledAt: isoDate.nullish(),
    flowId: z.string().uuid().nullish(),
    scriptId: z.string().uuid().nullish(),
  })
  .refine(
    (v) => v.kind !== 'carousel' || (v.mediaPaths.length >= 2 && v.mediaPaths.length <= 10),
    'Carrossel leva de 2 a 10 imagens',
  )
  .refine((v) => v.kind === 'carousel' || v.mediaPaths.length === 1, 'Imagem, reel e story levam uma mídia só')
  .refine((v) => v.kind !== 'story' || !v.flowId, 'Story não recebe comentário — não há gatilho para vincular')

export type CreatePublicationInput = z.infer<typeof createSchema>

export async function createPublication(raw: unknown): Promise<PublicationActionResult> {
  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }
  const input = parsed.data

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  const scheduledAt = input.scheduledAt ? jitteredScheduleAt(new Date(input.scheduledAt)) : null

  const { data, error } = await supabaseAdmin
    .from('publications')
    .insert({
      account_id: account.id,
      kind: input.kind,
      caption: input.caption,
      media_paths: input.mediaPaths,
      cover_path: input.coverPath ?? null,
      flow_id: input.flowId ?? null,
      script_id: input.scriptId ?? null,
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduled_at: scheduledAt?.toISOString() ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: `Falha ao salvar: ${error.message}` }

  revalidatePath('/publicacoes')
  return { ok: true, id: (data as { id: string }).id }
}

/**
 * Transição condicionada ao estado atual — é o que impede cancelar o que o
 * tick já reclamou (`publishing`) ou reagendar o que já saiu.
 */
async function transition(
  id: string,
  from: PublicationStatus[],
  patch: Partial<Publication>,
): Promise<PublicationActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Publicação inválida.' }

  const { data, error } = await supabaseAdmin
    .from('publications')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', from)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: `Falha ao atualizar: ${error.message}` }
  if (!data) return { ok: false, error: 'A publicação mudou de estado; recarregue a lista.' }

  revalidatePath('/publicacoes')
  return { ok: true, id }
}

/** Rascunho, agendada ou falha entram (de novo) na fila, com as tentativas zeradas. */
export async function schedulePublication(id: string, atIso: string): Promise<PublicationActionResult> {
  const at = isoDate.safeParse(atIso)
  if (!at.success) return { ok: false, error: 'Data inválida.' }

  return transition(id, ['draft', 'scheduled', 'failed'], {
    status: 'scheduled',
    scheduled_at: jitteredScheduleAt(new Date(at.data)).toISOString(),
    attempts: 0,
    error: null,
  })
}

/** "Agora" é agora mais o jitter — sai em até 7 minutos, pelo tick. */
export async function publishNow(id: string): Promise<PublicationActionResult> {
  return schedulePublication(id, new Date().toISOString())
}

/** Só o que ainda não foi reclamado pelo tick. `publishing` não se cancela: a Meta pode já ter o container. */
export async function cancelPublication(id: string): Promise<PublicationActionResult> {
  return transition(id, ['scheduled'], { status: 'draft', scheduled_at: null })
}

/** Apaga rascunho ou falha, e os arquivos dela no bucket. */
export async function deletePublication(id: string): Promise<PublicationActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Publicação inválida.' }

  const { data: row } = await supabaseAdmin
    .from('publications')
    .select('status, media_paths, cover_path')
    .eq('id', id)
    .maybeSingle()

  if (!row) return { ok: false, error: 'Publicação não encontrada.' }
  const current = row as Pick<Publication, 'status' | 'media_paths' | 'cover_path'>
  if (current.status !== 'draft' && current.status !== 'failed') {
    return { ok: false, error: 'Só rascunho ou falha podem ser apagados.' }
  }

  const paths = [...current.media_paths, ...(current.cover_path ? [current.cover_path] : [])]
  if (paths.length > 0) {
    const { error } = await supabaseAdmin.storage.from(PUBLICATION_MEDIA_BUCKET).remove(paths)
    // Arquivo órfão no bucket é lixo, não incidente: a linha some do mesmo jeito.
    if (error) console.error('[dm-flow] não consegui apagar mídia da publicação:', id, error.message)
  }

  const { error } = await supabaseAdmin.from('publications').delete().eq('id', id)
  if (error) return { ok: false, error: `Falha ao apagar: ${error.message}` }

  revalidatePath('/publicacoes')
  return { ok: true, id }
}

export interface CaptionResult {
  ok: boolean
  error?: string
  caption?: string
  /** A IA não respondeu: o texto é exemplo e a tela avisa — o dono revisa antes de usar. */
  warning?: string
}

/**
 * A legenda do upload, escrita olhando a FOTO (visão). A imagem vai direto do
 * formulário para o modelo — não passa pelo bucket, porque legenda se gera
 * antes de decidir publicar, e o bucket é o que a Meta serve ao público.
 */
export async function generateUploadCaption(formData: FormData): Promise<CaptionResult> {
  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  const persona = await activePersona(account.id, null)
  if (!persona) return { ok: false, error: 'Nenhuma persona ativa. A legenda sai na voz dela — cadastre antes.' }

  const kindRaw = String(formData.get('kind') ?? '')
  if (kindRaw !== 'image' && kindRaw !== 'carousel' && kindRaw !== 'reel') {
    return { ok: false, error: 'Tipo inválido.' }
  }

  const draft = String(formData.get('draft') ?? '').trim() || null

  let image: { mediaType: 'image/jpeg' | 'image/png'; base64: string } | null = null
  const file = formData.get('file')
  if (file instanceof File && file.size > 0) {
    if (!isImageType(file.type)) return { ok: false, error: 'Só JPEG ou PNG para a legenda.' }
    if (file.size > IMAGE_MAX_BYTES) return { ok: false, error: 'Imagem maior que 8 MB.' }
    image = { mediaType: file.type, base64: Buffer.from(await file.arrayBuffer()).toString('base64') }
  }

  const generated = await generateCaption({ persona, kind: kindRaw, draft, image })

  return {
    ok: true,
    caption: generated.caption,
    warning: generated.mock
      ? `A IA não respondeu (${generated.fallbackReason ?? 'motivo desconhecido'}) — isto é um EXEMPLO, revise antes de publicar.`
      : undefined,
  }
}
