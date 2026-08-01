import { z } from 'zod'

/**
 * A forma do roteiro que o gerador devolve.
 *
 * O mesmo schema serve a três coisas ao mesmo tempo: vira o JSON Schema que a
 * Anthropic recebe (`z.toJSONSchema`), valida a resposta antes de gravar e
 * tipa quem lê `scripts.output` depois. Uma cópia só, porque duas divergem.
 *
 * Validar não é zelo excessivo — é a regra herdada do projeto de origem, e ela
 * existe porque modelo devolve JSON quebrado de vez em quando: um gancho a
 * menos, campo faltando, string onde era objeto. Sem o parse isso entra em
 * `scripts.output` e só aparece na tela, dias depois, quando ninguém mais
 * lembra de qual geração veio.
 */

/**
 * A unidade do roteiro: o que aparece escrito e o que a pessoa fala.
 * Os dois juntos, sempre — texto de tela sem fala vira card, fala sem texto de
 * tela perde quem assiste sem som.
 */
const takeSchema = z.object({
  tela: z.string().min(1).describe('Texto queimado na tela neste momento'),
  fala: z
    .string()
    .min(1)
    .describe('Fala palavra por palavra, pronta para o creator ler na gravação'),
})

/** Três ganchos para testar. Menos que isso não dá teste A/B; mais vira indecisão. */
export const HOOK_VARIANTS = 3

/** Abaixo disso não é roteiro, é frase solta. */
const MIN_BEATS = 3

export const scriptSchema = z.object({
  headline: z.string().min(1).describe('Headline no formato da fórmula da persona'),
  hooks: z
    .array(takeSchema)
    .length(HOOK_VARIANTS)
    .describe(`${HOOK_VARIANTS} variações de gancho de 3 segundos para testar`),
  beats: z
    .array(
      takeSchema.extend({
        beat: z
          .string()
          .min(1)
          .describe('Rótulo do momento + faixa de tempo, ex: "Problema (4-15s)"'),
      }),
    )
    .min(MIN_BEATS)
    .describe('O roteiro completo em blocos, na ordem de gravação'),
  caption: z.string().min(1).describe('Legenda longa do post, com hashtags'),
  /**
   * O fecho é diferente por plataforma e por isso mora fora dos `beats`: o
   * vídeo gravado é o mesmo nos dois canais, só o pedido final muda. Deixar o
   * CTA no meio dos beats obrigaria a regravar para publicar no outro.
   */
  ctas: z
    .object({
      tiktok: takeSchema.describe('Fecho do TikTok: pedir para SEGUIR o perfil'),
      instagram: takeSchema.describe(
        'Fecho do Instagram: pedir para COMENTAR a palavra-chave e seguir',
      ),
    })
    .describe('CTA por plataforma — mesmo vídeo, fecho diferente'),
  format: z
    .object({
      tipo: z
        .string()
        .min(1)
        .describe('talking head, screencast, talking head + screencast, POV...'),
      dica: z.string().min(1).describe('Dica prática de gravação: o que mostrar, que ritmo'),
    })
    .describe('Como gravar. Roteiro sem instrução de gravação vira texto parado'),
})

export type Script = z.infer<typeof scriptSchema>

/**
 * A forma da entrega: o material que o CTA do roteiro prometeu, em blocos
 * tipados — NUNCA HTML. O conteúdo vem de um modelo de linguagem, e HTML
 * livre de modelo é XSS servido na própria página (ver `card 01, Fase 1`). O
 * modelo escolhe a estrutura entre os sete tipos abaixo; os componentes que
 * renderizam cada um são nossos.
 */
const headingBlockSchema = z.object({
  type: z.literal('heading'),
  text: z.string().min(1).describe('Título de uma seção da entrega, curto'),
})

const paragraphBlockSchema = z.object({
  type: z.literal('paragraph'),
  text: z.string().min(1).describe('Parágrafo de texto corrido'),
})

const listBlockSchema = z.object({
  type: z.literal('list'),
  items: z.array(z.string().min(1)).min(1).describe('Itens soltos, sem ordem entre eles'),
})

const checklistBlockSchema = z.object({
  type: z.literal('checklist'),
  items: z.array(z.string().min(1)).min(1).describe('Itens para a pessoa marcar como feito'),
})

const stepsBlockSchema = z.object({
  type: z.literal('steps'),
  items: z
    .array(
      z.object({
        title: z.string().min(1).describe('Título curto do passo'),
        text: z.string().min(1).describe('O que fazer neste passo'),
      }),
    )
    .min(1)
    .describe('Passo a passo numerado, na ordem de execução'),
})

const quoteBlockSchema = z.object({
  type: z.literal('quote'),
  text: z.string().min(1).describe('Citação ou frase de destaque'),
})

const calloutBlockSchema = z.object({
  type: z.literal('callout'),
  text: z.string().min(1).describe('Aviso ou ponto que precisa saltar aos olhos'),
})

export const deliveryBlockSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  paragraphBlockSchema,
  listBlockSchema,
  checklistBlockSchema,
  stepsBlockSchema,
  quoteBlockSchema,
  calloutBlockSchema,
])

export type DeliveryBlock = z.infer<typeof deliveryBlockSchema>

/** Abaixo disso não é entrega, é teaser — a promessa do roteiro pede material. */
const MIN_DELIVERY_BLOCKS = 2

export const deliverySchema = z.object({
  title: z.string().min(1).describe('Título da página de entrega'),
  subtitle: z.string().min(1).optional().describe('Subtítulo opcional, uma linha'),
  blocks: z
    .array(deliveryBlockSchema)
    .min(MIN_DELIVERY_BLOCKS)
    .describe('O conteúdo completo da entrega, em blocos, na ordem de leitura'),
})

/**
 * Nome de propósito distinto de `Delivery` (a linha da tabela, em
 * `src/types/db.ts`): este é só title/subtitle/blocks, o que o modelo escreve
 * — não a linha inteira, que também tem `id`, `slug`, `status` etc.
 */
export type DeliveryContent = z.infer<typeof deliverySchema>

/**
 * `deliveries.blocks` é `jsonb` — o banco aceita qualquer coisa ali. Linha
 * malformada vira lista vazia em vez de derrubar a página pública — mesmo
 * padrão de `parseNamedMechanisms` (`build-system-prompt.ts`).
 */
export function parseDeliveryBlocks(raw: unknown): DeliveryBlock[] {
  const parsed = z.array(deliveryBlockSchema).safeParse(raw)
  return parsed.success ? parsed.data : []
}
