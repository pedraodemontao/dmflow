import { z } from 'zod'

import { AnthropicError, generateStructured, hasAnthropicKey } from '@/lib/ai/anthropic'
import { buildCtaBlock, buildSystemPrompt } from '@/lib/ai/build-system-prompt'
import { carouselSchema, type Carousel } from '@/lib/ai/schemas'
import { TWEET_TEXT_MAX_CHARS } from '@/lib/render/tweet-element'
import type { Persona } from '@/types/db'

/**
 * Clonagem de conteúdo por visão (31/08): o dono sobe prints de um conteúdo
 * que performou, o modelo extrai a estrutura, e o resultado sai no NOSSO
 * render — paleta, tipografia, layouts. Dois modos:
 *
 *   copiar  → o texto vem como está (é para conteúdo do PRÓPRIO dono — post
 *             antigo, outra conta dele). Texto de terceiro copiado é plágio,
 *             e a tela diz isso.
 *   modelar → a INTELIGÊNCIA vem (estrutura, tipo de gancho, arco), o texto é
 *             reescrito na voz da persona, no nicho dela. É o mesmo princípio
 *             do "gerar modelado" da biblioteca, com print no lugar de item.
 *
 * SEM MOCK, de propósito: clonar sem enxergar o print não significa nada.
 * Sem chave ou sem resposta, a action devolve erro claro — diferente do
 * gerador, onde o mock mantém a tela viva.
 */

export type CloneMode = 'copiar' | 'modelar'

export interface CloneImage {
  mediaType: 'image/jpeg' | 'image/png'
  base64: string
}

interface CloneArgs {
  persona: Persona
  mode: CloneMode
  images: CloneImage[]
}

export type CloneResult<T> = { ok: true; output: T; model: string } | { ok: false; error: string }

const SEM_CHAVE =
  'Clonar precisa da IA com visão, e a ANTHROPIC_API_KEY não está configurada (ou sem crédito). Não há fallback: sem enxergar o print, não existe clonagem.'

export function buildCarouselClonePrompt(persona: Persona, mode: CloneMode, total: number): string {
  const base = `As ${total} imagens acima são os slides de um carrossel que performou, NA ORDEM.`
  const regras = `Regras do schema: o primeiro slide é "cover", o último é "cta", os do meio são "body". Para cada slide do meio, escolha o layout que melhor representa o DESENHO original: "lista" para passos/itens, "numero" para um dado grande, "frase" para afirmação sozinha, "texto" para o resto. Se o carrossel original não fecha com CTA, escreva um fechamento curto pedindo comentário com a palavra-chave.`

  if (mode === 'copiar') {
    return `${base}

Transcreva o carrossel para o schema, mantendo o TEXTO COMO ESTÁ — só conserte erro óbvio de digitação e corte o que passar dos limites. Não reescreva, não melhore, não traduza.
${regras}

Legenda: transcreva a ideia da legenda original se ela aparecer; senão, escreva uma curta e direta sobre o conteúdo dos slides.

${buildCtaBlock(persona)}`
  }

  return `${base}

MODELE este carrossel para ${persona.name}: copie a INTELIGÊNCIA — estrutura, número de slides, tipo de gancho, arco — e reescreva 100% do texto na voz dela, sobre o nicho dela (${persona.niche}). Nada do texto original sobrevive literalmente.
${regras}

${buildCtaBlock(persona)}`
}

export async function cloneCarouselFromImages(args: CloneArgs): Promise<CloneResult<Carousel>> {
  if (!hasAnthropicKey()) return { ok: false, error: SEM_CHAVE }

  try {
    const result = await generateStructured({
      schema: carouselSchema,
      system: buildSystemPrompt(args.persona),
      prompt: buildCarouselClonePrompt(args.persona, args.mode, args.images.length),
      toolName: 'entregar_carrossel_clonado',
      toolDescription: 'Entrega o carrossel extraído dos prints, no schema.',
      task: 'clone',
      images: args.images,
    })
    return { ok: true, output: result.output, model: result.model }
  } catch (error) {
    const detail = error instanceof AnthropicError ? error.message : String(error)
    return { ok: false, error: `A clonagem falhou: ${detail}` }
  }
}

export const clonedTextSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(TWEET_TEXT_MAX_CHARS)
    .describe(`O texto principal do post, até ${TWEET_TEXT_MAX_CHARS} caracteres`),
})

export function buildStaticClonePrompt(persona: Persona, mode: CloneMode): string {
  if (mode === 'copiar') {
    return `A imagem acima é um post de texto (estilo tweet/card) que performou. Extraia o TEXTO PRINCIPAL como está — sem nome de autor, sem handle, sem métricas, sem data. Só conserte erro óbvio de digitação.`
  }
  return `A imagem acima é um post de texto (estilo tweet/card) que performou. MODELE para ${persona.name}: mesmo tipo de afirmação, mesma força, mas reescrita na voz dela, sobre o nicho dela (${persona.niche}). Nada do texto original sobrevive literalmente. Sem nome de autor, sem handle, sem métricas.`
}

export async function cloneStaticFromImage(args: CloneArgs): Promise<CloneResult<{ text: string }>> {
  if (!hasAnthropicKey()) return { ok: false, error: SEM_CHAVE }

  try {
    const result = await generateStructured({
      schema: clonedTextSchema,
      system: buildSystemPrompt(args.persona),
      prompt: buildStaticClonePrompt(args.persona, args.mode),
      toolName: 'entregar_texto_clonado',
      toolDescription: 'Entrega o texto extraído do print.',
      task: 'clone',
      images: args.images,
    })
    return { ok: true, output: result.output, model: result.model }
  } catch (error) {
    const detail = error instanceof AnthropicError ? error.message : String(error)
    return { ok: false, error: `A clonagem falhou: ${detail}` }
  }
}
