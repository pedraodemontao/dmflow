import { AnthropicError, generateStructured, hasAnthropicKey } from '@/lib/ai/anthropic'
import { buildDeliverySystemPrompt } from '@/lib/ai/build-system-prompt'
import { MOCK_MODEL } from '@/lib/ai/generate'
import { deliverySchema, type DeliveryContent } from '@/lib/ai/schemas'
import type { FunnelStage, Persona } from '@/types/db'

/**
 * O gerador da entrega — a SEGUNDA chamada ao modelo, separada da do
 * roteiro (`generate.ts`). Roteiro e entrega são peças diferentes: o roteiro
 * é falado, curto, com gancho; a entrega é lida, densa, sem gancho. Um
 * prompt só produz uma coisa morna que não serve para nenhuma das duas.
 *
 * Mesmo caminho duplo do roteiro: Anthropic quando há chave, mock
 * determinístico quando não há.
 */

export interface GenerateDeliveryInput {
  persona: Persona
  stage: FunnelStage
  /**
   * A promessa LITERAL feita no CTA do roteiro (`ctas.instagram.fala`), não o
   * tema. É o contrato que a entrega precisa cumprir — se o vídeo prometeu
   * "mapa de 7 passos", a entrega tem 7 passos.
   */
  promise: string
}

export interface GeneratedDelivery {
  output: DeliveryContent
  model: string
  /** `null` no mock: não houve chamada, e gravar 0 fingiria que houve. */
  tokensIn: number | null
  tokensOut: number | null
}

const TOOL_NAME = 'entregar_material'
const TOOL_DESCRIPTION =
  'Entrega o conteúdo da página que cumpre a promessa feita no CTA do roteiro, em blocos.'

export function buildDeliveryUserPrompt(input: GenerateDeliveryInput): string {
  return `Escreva o conteúdo da página de entrega para ${input.persona.name}.

# O QUE O VÍDEO PROMETEU (cumpra ISTO, literalmente)
"${input.promise}"

ETAPA DO FUNIL: ${input.stage.label}
${input.stage.cta_instruction}

Escreva o material completo que cumpre essa promessa, em blocos. Comece com um heading, e entregue o conteúdo prometido por inteiro — não um resumo, não um teaser empurrando para outro lugar.`
}

export async function generateDelivery(input: GenerateDeliveryInput): Promise<GeneratedDelivery> {
  if (!hasAnthropicKey()) {
    return { output: mockDelivery(input), model: MOCK_MODEL, tokensIn: null, tokensOut: null }
  }

  try {
    const result = await generateStructured({
      schema: deliverySchema,
      system: buildDeliverySystemPrompt(input.persona),
      prompt: buildDeliveryUserPrompt(input),
      toolName: TOOL_NAME,
      toolDescription: TOOL_DESCRIPTION,
    })

    return {
      output: result.output,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }
  } catch (error) {
    // Mesma regra do roteiro: provedor fora do ar, chave inválida, schema
    // teimoso — a tela continua entregando uma entrega. `model_used` grava
    // `mock`, então dá para separar depois o que a IA escreveu do fallback.
    const detail = error instanceof AnthropicError ? error.message : String(error)
    console.error('[ai] geração da entrega falhou, caindo no mock:', detail)
    return { output: mockDelivery(input), model: MOCK_MODEL, tokensIn: null, tokensOut: null }
  }
}

/**
 * Fallback determinístico: mesma entrada, mesma entrega. Mesmo motivo do
 * `mockScript`: testa o caminho inteiro sem rede e sem crédito.
 */
export function mockDelivery(input: GenerateDeliveryInput): DeliveryContent {
  const promise = input.promise.trim() || 'o material prometido'

  return {
    title: `Seu material, ${input.persona.name}`,
    subtitle: promise,
    blocks: [
      { type: 'heading', text: promise },
      {
        type: 'paragraph',
        text: `Aqui está o que prometi no vídeo: ${promise}. ${input.stage.cta_instruction}`,
      },
      {
        type: 'steps',
        items: [
          { title: 'Passo 1', text: 'Comece por aqui.' },
          { title: 'Passo 2', text: 'Continue com isso.' },
        ],
      },
    ],
  }
}
