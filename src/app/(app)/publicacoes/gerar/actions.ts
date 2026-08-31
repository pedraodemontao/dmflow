'use server'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { activePersona, loadCarouselContext, type CarouselContextProblem } from '@/lib/ai/carousel-context'
import { cloneCarouselFromImages, type CloneImage, type CloneMode } from '@/lib/ai/clone-content'
import { IMAGE_MAX_BYTES, isImageType } from '@/lib/publications/rules'
import { MOCK_MODEL } from '@/lib/ai/generate'
import { generateCarousel } from '@/lib/ai/generate-carousel'
import { carouselSchema, type Carousel } from '@/lib/ai/schemas'
import { getAccount } from '@/lib/data'
import { loadBrandPalette } from '@/lib/render/palette'
import { publicationMediaUrl } from '@/lib/publications/media-url'
import { env } from '@/lib/env'
import { renderAndUploadCarousel } from '@/lib/render/render-carousel'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Persona, Script as ScriptRow } from '@/types/db'

/**
 * Geração e render do carrossel (card 05, fase 3).
 *
 * Duas actions, e a divisão é o custo: gerar é uma chamada paga ao modelo;
 * renderizar é CPU nossa. Editar um slide e renderizar de novo não pode
 * custar outra geração — é a mesma regra da entrega (`updateDelivery`).
 *
 * Publicar não é daqui. A tela termina em `createPublication` (card 04), e
 * de lá o tick faz o resto.
 */

export interface ComposerResult {
  ok: boolean
  error?: string
  /** Aviso que não impede: gerado mas não gravado em `scripts`, texto editado não salvo. */
  warning?: string
  /** Linha em `scripts`, quando a gravação deu certo. */
  scriptId?: string | null
  /** Pasta no bucket. Persistente entre renders da mesma sessão. */
  renderKey?: string
  carousel?: Carousel
  paths?: string[]
  urls?: string[]
  model?: string
  /** Texto de EXEMPLO (a IA não respondeu). A tela não deixa publicar. */
  mock?: boolean
}

const uuid = z.string().uuid()

const generateSchema = z.object({
  libraryItemId: uuid.nullish(),
  scriptId: uuid.nullish(),
  pillarId: uuid.nullish(),
  theme: z.string().trim().max(200).nullish(),
})

const PROBLEM_MESSAGE: Record<CarouselContextProblem, string> = {
  'sem-conta': 'Nenhuma conta do Instagram conectada.',
  'sem-persona': 'Nenhuma persona ativa. Cadastre a persona antes de gerar.',
  'sem-etapa': 'Etapa de funil sem CTA cadastrado para esta persona.',
  'item-nao-encontrado': 'Conteúdo não encontrado na biblioteca.',
  'roteiro-nao-encontrado': 'Roteiro não encontrado.',
  'roteiro-invalido': 'Este roteiro não tem a forma de um Reel — só roteiro de Reel vira carrossel.',
}

export async function generateAndRenderCarousel(raw: unknown): Promise<ComposerResult> {
  const parsed = generateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }
  const input = parsed.data

  const loaded = await loadCarouselContext({
    libraryItemId: input.libraryItemId,
    scriptId: input.scriptId,
    pillarId: input.pillarId,
    theme: input.theme?.trim() || null,
  })
  if (!loaded.ok) return { ok: false, error: PROBLEM_MESSAGE[loaded.problem] }
  const context = loaded.context

  const generated = await generateCarousel({
    accountId: context.accountId,
    persona: context.persona,
    pillarId: context.pillarId,
    pillar: context.pillar,
    theme: context.theme,
    refs: context.refs,
    modeledOn: context.modeledOn,
    fromScript: context.fromScript,
  })

  // Sem linha em `scripts` a pasta ganha um uuid: o carrossel existe e foi
  // pago, e o bucket não precisa do roteiro para guardar os slides.
  const renderKey = generated.script?.id ?? randomUUID()
  const mock = generated.model === MOCK_MODEL
  const mockWarning = mock
    ? `A IA não respondeu (${generated.fallbackReason ?? 'motivo desconhecido'}). Este texto é um EXEMPLO e não pode ser publicado — resolva o motivo e gere de novo.`
    : null

  try {
    const rendered = await renderAndUploadCarousel({
      renderKey,
      carousel: generated.output,
      brand: {
        handle: context.handle,
        ctaKeyword: context.persona.cta_keyword,
        palette: await loadBrandPalette(context.accountId),
      },
    })

    return {
      ok: true,
      scriptId: generated.script?.id ?? null,
      renderKey,
      carousel: generated.output,
      paths: rendered.paths,
      urls: rendered.urls,
      model: generated.model,
      mock,
      warning:
        mockWarning ??
        (generated.scriptError ? `Gerado, mas não salvo em Roteiros: ${generated.scriptError}` : undefined),
    }
  } catch (error) {
    // O texto já existe e foi pago: volta com ele, sem imagens, para o dono
    // tentar renderizar de novo em vez de gerar de novo.
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: true,
      scriptId: generated.script?.id ?? null,
      renderKey,
      carousel: generated.output,
      paths: [],
      urls: [],
      model: generated.model,
      mock,
      warning: mockWarning ?? `Texto gerado, mas o render falhou: ${detail}. Edite se quiser e renderize de novo.`,
    }
  }
}

const rerenderSchema = z.object({
  renderKey: uuid,
  scriptId: uuid.nullish(),
  carousel: z.unknown(),
  /** Arte de fundo da capa: caminho no bucket (subido pela tela), nunca URL. */
  coverBackgroundPath: z.string().regex(/^uploads\/[A-Za-z0-9._/-]+$/).nullish(),
})

/** Texto editado → JPEGs novos (pasta nova no bucket) → `scripts.output` atualizado. Sem chamada ao modelo. */
export async function rerenderCarousel(raw: unknown): Promise<ComposerResult> {
  const parsed = rerenderSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

  const carousel = carouselSchema.safeParse(parsed.data.carousel)
  if (!carousel.success) {
    const issue = carousel.error.issues[0]
    return {
      ok: false,
      error: issue ? `${issue.path.join('.') || 'carrossel'}: ${issue.message}` : 'Carrossel inválido.',
    }
  }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }

  // A palavra do CTA vem da persona do roteiro quando há um; senão da ativa.
  let personaId: string | null = null
  if (parsed.data.scriptId) {
    const { data } = await supabaseAdmin
      .from('scripts')
      .select('persona_id')
      .eq('id', parsed.data.scriptId)
      .maybeSingle()
    personaId = (data as Pick<ScriptRow, 'persona_id'> | null)?.persona_id ?? null
  }
  const personaQuery = personaId
    ? supabaseAdmin.from('personas').select('*').eq('id', personaId).maybeSingle()
    : supabaseAdmin
        .from('personas')
        .select('*')
        .eq('account_id', account.id)
        .eq('is_active', true)
        .order('created_at')
        .limit(1)
        .maybeSingle()
  const { data: personaRow } = await personaQuery
  const persona = (personaRow as Persona | null) ?? null
  if (!persona) return { ok: false, error: 'Nenhuma persona ativa.' }

  // A arte sobe pro bucket pela tela; aqui ela vira data URI porque o satori
  // precisa dos bytes, e buscar nós mesmos evita depender do fetch dele.
  let coverBackgroundDataUri: string | undefined
  if (parsed.data.coverBackgroundPath) {
    const url = publicationMediaUrl(parsed.data.coverBackgroundPath, env.SUPABASE_URL)
    if (url) {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return { ok: false, error: `Não achei a arte da capa no bucket (${res.status}).` }
      coverBackgroundDataUri = `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
    }
  }

  try {
    const rendered = await renderAndUploadCarousel({
      renderKey: parsed.data.renderKey,
      carousel: carousel.data,
      brand: {
        handle: account.username ?? '',
        ctaKeyword: persona.cta_keyword,
        palette: await loadBrandPalette(account.id),
        coverBackgroundDataUri,
      },
    })

    let warning: string | undefined
    if (parsed.data.scriptId) {
      const { error } = await supabaseAdmin
        .from('scripts')
        .update({ output: carousel.data })
        .eq('id', parsed.data.scriptId)
      // Aviso, não exceção, de propósito: o retorno É lido e a falha VAI para a
      // tela. Lançar jogaria fora um render que deu certo — e as imagens já
      // carregam o texto editado; `scripts.output` aqui é registro, não fonte.
      if (error) warning = `Renderizado, mas o texto editado não foi salvo em Roteiros: ${error.message}`
    }

    return {
      ok: true,
      scriptId: parsed.data.scriptId ?? null,
      renderKey: parsed.data.renderKey,
      carousel: carousel.data,
      paths: rendered.paths,
      urls: rendered.urls,
      warning,
    }
  } catch (error) {
    return { ok: false, error: `Render falhou: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Clonar carrossel de prints (31/08): os slides de um conteúdo que performou
 * viram um Draft do compositor — extraídos por visão, renderizados na nossa
 * marca. `copiar` mantém o texto (para conteúdo do PRÓPRIO dono); `modelar`
 * reescreve na voz da persona. O resultado cai no MESMO fluxo do gerar:
 * editar, re-renderizar, salvar.
 */
export async function cloneCarousel(formData: FormData): Promise<ComposerResult> {
  const mode = String(formData.get('mode') ?? '')
  if (mode !== 'copiar' && mode !== 'modelar') return { ok: false, error: 'Modo inválido.' }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length < 1 || files.length > 10) return { ok: false, error: 'Suba de 1 a 10 prints, na ordem dos slides.' }

  const images: CloneImage[] = []
  for (const file of files) {
    if (!isImageType(file.type)) return { ok: false, error: 'Só JPEG ou PNG.' }
    if (file.size > IMAGE_MAX_BYTES) return { ok: false, error: `Print maior que 8 MB: ${file.name}` }
    images.push({ mediaType: file.type, base64: Buffer.from(await file.arrayBuffer()).toString('base64') })
  }

  const account = await getAccount()
  if (!account) return { ok: false, error: 'Nenhuma conta do Instagram conectada.' }
  const persona = await activePersona(account.id, null)
  if (!persona) return { ok: false, error: 'Nenhuma persona ativa. Modelar e copiar saem na voz dela — cadastre antes.' }

  const cloned = await cloneCarouselFromImages({ persona, mode: mode as CloneMode, images })
  if (!cloned.ok) return { ok: false, error: cloned.error }

  // Vai para `scripts` como toda peça de IA — é o histórico que a tela de
  // Roteiros lê. Falha ao gravar não descarta o clone: o dono já pagou.
  const { data: scriptRow, error: scriptError } = await supabaseAdmin
    .from('scripts')
    .insert({
      account_id: account.id,
      persona_id: persona.id,
      kind: 'carousel',
      theme: `clonado (${mode})`,
      output: cloned.output,
      model_used: cloned.model,
    })
    .select('id')
    .single()
  if (scriptError) console.error('[ai] clone não gravado em scripts:', scriptError.message)

  const renderKey = (scriptRow as { id: string } | null)?.id ?? randomUUID()

  try {
    const rendered = await renderAndUploadCarousel({
      renderKey,
      carousel: cloned.output,
      brand: {
        handle: account.username ?? '',
        ctaKeyword: persona.cta_keyword,
        palette: await loadBrandPalette(account.id),
      },
    })
    return {
      ok: true,
      scriptId: (scriptRow as { id: string } | null)?.id ?? null,
      renderKey,
      carousel: cloned.output,
      paths: rendered.paths,
      urls: rendered.urls,
      model: cloned.model,
      warning: scriptError ? `Clonado, mas não salvo em Roteiros: ${scriptError.message}` : undefined,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: true,
      scriptId: (scriptRow as { id: string } | null)?.id ?? null,
      renderKey,
      carousel: cloned.output,
      paths: [],
      urls: [],
      model: cloned.model,
      warning: `Clonado, mas o render falhou: ${detail}. Renderize de novo.`,
    }
  }
}
