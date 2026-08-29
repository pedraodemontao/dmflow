import { AnthropicError, generateStructured, hasAnthropicKey } from '@/lib/ai/anthropic'
import { buildCtaBlock, buildSystemPrompt } from '@/lib/ai/build-system-prompt'
import { MOCK_MODEL } from '@/lib/ai/generate'
import { formatRefs } from '@/lib/ai/retrieve'
import { charLength, truncateChars } from '@/lib/flow/types'
import {
  carouselSchema,
  SLIDE_BODY_MAX_CHARS,
  SLIDE_TITLE_MAX_CHARS,
  type Carousel,
  type CarouselSlide,
  type Script,
} from '@/lib/ai/schemas'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { LibraryItem, Persona, Script as ScriptRow } from '@/types/db'

/**
 * O gerador de carrossel (card 05). Espelha `generate.ts`: Anthropic quando há
 * chave, mock determinístico quando não há ou quando a chamada falha — mesma
 * regra, mesmo motivo (a tela nunca fica sem nada para mostrar).
 *
 * Diferença de propósito para `generate.ts`/`generate-delivery.ts`: aqueles
 * dois são puros e quem chama grava a linha em `scripts` (a rota tem o
 * contexto — persona ativa, item da biblioteca, etc). O carrossel não tem
 * rota própria neste card (a tela só chega na fase 3), então `generateCarousel`
 * grava direto — e devolve o resultado MESMO se a gravação falhar, porque o
 * dono já pagou a geração (`01-entrega.md`, fase 2).
 */

export interface GenerateCarouselInput {
  accountId: string
  persona: Persona
  /** Id em `content_pillars`, quando o pilar é um pilar cadastrado. Nulo é legítimo: tema livre. */
  pillarId: string | null
  pillar: string
  theme: string | null
  /** O acervo que serve de grounding. Vazio é legítimo: biblioteca nova. */
  refs: LibraryItem[]
  /** O vídeo que serve de molde — o mesmo botão que gera roteiro modelado. */
  modeledOn?: LibraryItem | null
  /**
   * Um roteiro que já existe vira carrossel: mesma ideia, lida em vez de
   * falada. Tem prioridade sobre `modeledOn` — os dois presentes não fazem
   * sentido ao mesmo tempo, e o roteiro é o pedido mais específico dos dois.
   */
  fromScript?: Script | null
}

export interface GeneratedCarousel {
  output: Carousel
  model: string
  /** `null` no mock: não houve chamada, e gravar 0 fingiria que houve. */
  tokensIn: number | null
  tokensOut: number | null
  /** A linha gravada em `scripts`, ou `null` se a gravação falhou. */
  script: ScriptRow | null
  scriptError: string | null
}

export const MOCK_BODY_SLIDES = 3

const TOOL_NAME = 'entregar_carrossel'
const TOOL_DESCRIPTION =
  'Entrega os slides do carrossel completos, em português do Brasil, na voz do creator.'

/** Quanto da legenda do vídeo-molde ou do roteiro-origem entra no prompt. */
const CAPTION_EXCERPT = 220

function themeLine(input: GenerateCarouselInput): string {
  return input.theme?.trim() || '(livre, escolha o ângulo mais forte do pilar)'
}

/**
 * Corta por code point, não por unidade UTF-16 (`truncateChars`, `flow/types.ts`)
 * — mesma cerca do `send()` de DM: `.slice()` cru parte par substituto de
 * emoji ao meio e produz UTF-8 inválido, que o insert em `scripts` recusaria.
 */
function truncate(text: string, max: number): string {
  return charLength(text) > max ? `${truncateChars(text, max - 1).trimEnd()}…` : text
}

function beatsBlock(script: Script): string {
  return script.beats.map((beat) => `• ${beat.beat}: ${beat.tela} — ${beat.fala}`).join('\n')
}

const closing =
  'Entregue: os slides (campo "slides", capa → corpo → CTA) e a legenda do post (campo "caption"), com hashtags.'

/**
 * O prompt do pedido. Três formas, na ordem de prioridade: um roteiro que já
 * existe (`fromScript`), um vídeo real que virou molde (`modeledOn`), ou
 * pilar + tema com a biblioteca inteira como referência. O que muda entre
 * elas é o grounding, não as regras — regra é system prompt.
 */
export function buildCarouselUserPrompt(input: GenerateCarouselInput): string {
  const keyword = input.persona.cta_keyword.trim() || 'EU QUERO'

  if (input.fromScript) {
    const script = input.fromScript

    return `Transforme este roteiro de Reel de ${input.persona.name} num carrossel de imagens para o Instagram — a MESMA ideia, LIDA em vez de FALADA. Não é resumo: é a mesma promessa, reorganizada em slides.

# ROTEIRO ORIGINAL (a fonte, não copie o texto — adapte para leitura)
Headline: ${script.headline}
${beatsBlock(script)}
Legenda original: "${script.caption.slice(0, CAPTION_EXCERPT)}"

Mantenha a MESMA promessa e a MESMA palavra-chave de CTA ("${keyword}") — o carrossel não inventa uma promessa nova.
Um slide = uma ideia; a capa é UM gancho (não teste A/B); os slides do meio desenvolvem o roteiro na ordem dos beats; o último é o CTA.

${buildCtaBlock(input.persona)}

${closing}`
  }

  if (input.modeledOn) {
    const molde = input.modeledOn

    return `Crie um carrossel de imagens NOVO para ${input.persona.name}, MODELADO neste conteúdo real que JÁ PERFORMOU no nicho. Copie a INTELIGÊNCIA (estrutura, ângulo, tipo de gancho) — NÃO o texto. Reescreva tudo na voz dele, no tema dele (${input.persona.niche}).

# CONTEÚDO DE REFERÊNCIA (modele isto)
- Autor: @${molde.owner_handle ?? '?'} (${molde.plays} plays${molde.outlier !== null ? `, ${molde.outlier}× a mediana do próprio perfil` : ''})
- Estrutura que funcionou: ${molde.structure ?? '?'}
- Legenda original: "${molde.caption.slice(0, CAPTION_EXCERPT)}"

PILAR: ${input.pillar}
TEMA/ÂNGULO: ${themeLine(input)}

Um slide = uma ideia; a capa é UM gancho só (carrossel não tem teste A/B de gancho); os slides do meio desenvolvem o ângulo; o último é o CTA.

${buildCtaBlock(input.persona)}

${closing}`
  }

  const refs = input.refs.length > 0 ? formatRefs(input.refs) : '(biblioteca ainda vazia)'

  return `Crie um carrossel de imagens para ${input.persona.name}.
PILAR: ${input.pillar}
TEMA/GANCHO ESPECÍFICO: ${themeLine(input)}

# CONTEÚDOS REAIS DO NICHO QUE PERFORMARAM (sua INTELIGÊNCIA — modele o ângulo e a estrutura NISSO, reescreva 100% na voz do creator)
${refs}

Um slide = uma ideia; a capa é UM gancho só (carrossel não tem teste A/B de gancho); os slides do meio desenvolvem o ângulo; o último é o CTA.

${buildCtaBlock(input.persona)}

${closing}`
}

export async function generateCarousel(input: GenerateCarouselInput): Promise<GeneratedCarousel> {
  const generated = await runGeneration(input)

  const { data, error } = await supabaseAdmin
    .from('scripts')
    .insert({
      account_id: input.accountId,
      persona_id: input.persona.id,
      pillar_id: input.pillarId,
      theme: input.theme,
      source_library_item_id: input.modeledOn?.id ?? null,
      kind: 'carousel',
      output: generated.output,
      model_used: generated.model,
      tokens_in: generated.tokensIn,
      tokens_out: generated.tokensOut,
    })
    .select('*')
    .single()

  if (error) {
    // O carrossel existe mas não foi gravado. Devolver sem ele faria o dono
    // pagar a geração duas vezes — mesma regra do roteiro (`generate-from-item/route.ts`).
    console.error('[ai] falha ao gravar carrossel:', error.message)
    return { ...generated, script: null, scriptError: error.message }
  }

  return { ...generated, script: data as ScriptRow, scriptError: null }
}

async function runGeneration(
  input: GenerateCarouselInput,
): Promise<Omit<GeneratedCarousel, 'script' | 'scriptError'>> {
  if (!hasAnthropicKey()) {
    return { output: mockCarousel(input), model: MOCK_MODEL, tokensIn: null, tokensOut: null }
  }

  try {
    const result = await generateStructured({
      schema: carouselSchema,
      system: buildSystemPrompt(input.persona),
      prompt: buildCarouselUserPrompt(input),
      toolName: TOOL_NAME,
      toolDescription: TOOL_DESCRIPTION,
      // Forma fixa, teto de caractere por slide — o mesmo raciocínio do
      // degrau da entrega, não cópia por reflexo do roteiro (`anthropic.ts`).
      task: 'carousel',
    })

    return {
      output: result.output,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }
  } catch (error) {
    const detail = error instanceof AnthropicError ? error.message : String(error)
    console.error('[ai] geração do carrossel falhou, caindo no mock:', detail)
    return { output: mockCarousel(input), model: MOCK_MODEL, tokensIn: null, tokensOut: null }
  }
}

/**
 * Fallback determinístico: mesma entrada, mesmo carrossel. Mesmo motivo do
 * `mockScript`: testa o caminho inteiro (rota, validação, gravação) sem rede
 * e sem crédito.
 */
export function mockCarousel(input: GenerateCarouselInput): Carousel {
  const keyword = input.persona.cta_keyword.trim() || 'EU QUERO'
  const theme = (input.theme?.trim() || input.pillar).trim()
  const themeLower = theme.toLowerCase()
  const script = input.fromScript ?? null

  const coverTitle = script ? script.headline : `${theme}: o que ${input.persona.niche} ignora`

  const beats = script?.beats.slice(0, MOCK_BODY_SLIDES) ?? []
  const bodySlides: CarouselSlide[] = Array.from({ length: MOCK_BODY_SLIDES }, (_, index) => {
    const beat = beats[index]
    return {
      kind: 'body',
      title: truncate(beat?.tela || `Passo ${index + 1} de ${themeLower}`, SLIDE_TITLE_MAX_CHARS),
      body: truncate(
        beat?.fala || `O jeito certo de lidar com ${themeLower}, direto ao ponto.`,
        SLIDE_BODY_MAX_CHARS,
      ),
    }
  })

  const slides: CarouselSlide[] = [
    { kind: 'cover', title: truncate(coverTitle, SLIDE_TITLE_MAX_CHARS) },
    ...bodySlides,
    {
      kind: 'cta',
      title: truncate(`Comenta ${keyword}`, SLIDE_TITLE_MAX_CHARS),
      body: truncate(
        `Comenta ${keyword} aqui embaixo que eu te mando o passo a passo sobre ${themeLower}.`,
        SLIDE_BODY_MAX_CHARS,
      ),
    },
  ]

  return {
    slides,
    caption: `Se você quer resolver ${themeLower} sem enrolação, esse é o caminho. Comenta ${keyword} que eu te mando o passo a passo. Salva para fazer depois.`,
  }
}
