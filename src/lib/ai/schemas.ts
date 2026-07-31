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
