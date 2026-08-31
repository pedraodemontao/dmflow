import { z } from 'zod'

import { AnthropicError, generateStructured, hasAnthropicKey } from '@/lib/ai/anthropic'
import { buildCtaBlock, buildSystemPrompt } from '@/lib/ai/build-system-prompt'
import { MOCK_MODEL } from '@/lib/ai/generate'
import { CAROUSEL_CAPTION_MAX_CHARS } from '@/lib/ai/schemas'
import type { Persona, PublicationKind } from '@/types/db'

/**
 * A legenda do upload manual (fila pós-núcleo, feature 3).
 *
 * O dono sobe a FOTO; o modelo olha a foto (visão) e escreve a legenda na voz
 * da persona. É a menor peça de IA do produto — e segue as mesmas regras das
 * outras: mock determinístico sem chave ou sem resposta, com o motivo
 * declarado, porque um mock já foi publicado na conta real em 30/08.
 */

export const captionSchema = z.object({
  caption: z
    .string()
    .min(1)
    .max(CAROUSEL_CAPTION_MAX_CHARS)
    .describe(
      'A legenda pronta: gancho na primeira linha (é o que aparece antes do "mais"), corpo curto, CTA quando fizer sentido, hashtags no fim',
    ),
})

export interface GenerateCaptionInput {
  persona: Persona
  kind: PublicationKind
  /** O que o dono já tinha digitado — vira direção, não é jogado fora. */
  draft: string | null
  image?: { mediaType: 'image/jpeg' | 'image/png'; base64: string } | null
}

export interface GeneratedCaption {
  caption: string
  model: string
  mock: boolean
  fallbackReason: string | null
}

const TOOL_NAME = 'entregar_legenda'
const TOOL_DESCRIPTION = 'Entrega a legenda do post, em português do Brasil, na voz do creator.'

const KIND_LABEL: Record<PublicationKind, string> = {
  image: 'uma foto única',
  carousel: 'um carrossel',
  reel: 'um reel',
}

export function buildCaptionPrompt(input: GenerateCaptionInput): string {
  return `Escreva a legenda de ${KIND_LABEL[input.kind]} que ${input.persona.name} vai publicar no Instagram.
${input.image ? 'A imagem do post está acima — a legenda fala DELA, do que se vê, não de um tema genérico.' : '(sem imagem disponível — escreva a partir da direção abaixo)'}
${input.draft?.trim() ? `\nDireção que o creator já escreveu (aproveite a intenção, melhore a forma): "${input.draft.trim().slice(0, 400)}"` : ''}

Regras da legenda:
- A PRIMEIRA linha é o gancho: é o que aparece antes do "mais". Sem saudação, sem enrolação.
- Corpo curto, na voz do creator, sobre o que a imagem mostra.
- CTA só se fizer sentido para este post — pedir comentário com a palavra-chave é para post que promete material; foto de bastidor não precisa de CTA nenhum.
- Hashtags no fim, poucas e específicas.
${buildCtaBlock(input.persona)}

Entregue só a legenda (campo "caption").`
}

export async function generateCaption(input: GenerateCaptionInput): Promise<GeneratedCaption> {
  if (!hasAnthropicKey()) {
    return { caption: mockCaption(input), model: MOCK_MODEL, mock: true, fallbackReason: 'ANTHROPIC_API_KEY não configurada' }
  }

  try {
    const result = await generateStructured({
      schema: captionSchema,
      system: buildSystemPrompt(input.persona),
      prompt: buildCaptionPrompt(input),
      toolName: TOOL_NAME,
      toolDescription: TOOL_DESCRIPTION,
      task: 'caption',
      images: input.image ? [input.image] : undefined,
    })

    return { caption: result.output.caption, model: result.model, mock: false, fallbackReason: null }
  } catch (error) {
    const detail = error instanceof AnthropicError ? error.message : String(error)
    console.error('[ai] legenda falhou, caindo no mock:', detail)
    return { caption: mockCaption(input), model: MOCK_MODEL, mock: true, fallbackReason: detail }
  }
}

/** Determinístico, como os outros mocks: mesma entrada, mesma legenda. */
export function mockCaption(input: GenerateCaptionInput): string {
  const keyword = input.persona.cta_keyword.trim() || 'EU QUERO'
  const base = input.draft?.trim() || `Bastidor de hoje no ${input.persona.niche}.`
  return `${base}\n\nComenta ${keyword} que eu te mando o material.\n\n#${input.persona.niche.replace(/\s+/g, '')}`
}
