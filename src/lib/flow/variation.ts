/**
 * Variação obrigatória.
 *
 * Spintax era opcional: quem escrevesse texto simples mandava a MESMA frase
 * para todo mundo, e a ferramenta deixava. Texto idêntico em volume é o que o
 * filtro de spam do Instagram pune — foi a causa da restrição de 30/07/2026.
 *
 * Ferramenta que deixa o usuário se enforcar não é ferramenta. Aqui a regra é
 * checada ANTES de a automação poder ficar ativa.
 */

/** Quantas frases diferentes um texto com spintax consegue produzir. */
export function variantCount(text: string): number {
  const groups = text.match(/\{[^{}|]*(?:\|[^{}|]*)+\}/g)
  if (!groups) return 1

  return groups.reduce((total, group) => total * group.slice(1, -1).split('|').length, 1)
}

export interface VariationIssue {
  where: string
  variants: number
  message: string
}

/**
 * Mínimos por superfície. A resposta pública é a mais visível e a mais punida
 * (comentário repetido no mesmo post), então exige mais que a DM.
 */
const MIN_PUBLIC_REPLY = 3
const MIN_MESSAGE = 2

export function checkPublicReply(text: string | null | undefined): VariationIssue | null {
  const clean = text?.trim()
  if (!clean) return null

  const variants = variantCount(clean)
  if (variants >= MIN_PUBLIC_REPLY) return null

  return {
    where: 'Resposta pública',
    variants,
    message:
      `A resposta pública precisa de pelo menos ${MIN_PUBLIC_REPLY} variações — ela aparece ` +
      `repetida no mesmo post e é o que mais chama atenção do filtro de spam. ` +
      `Use {opção 1|opção 2|opção 3}.`,
  }
}

interface TextNode {
  id: string
  label: string
  text: string
}

/** Só o que a pessoa lê precisa variar: texto de mensagem, botão e pergunta. */
export function checkFlowTexts(nodes: TextNode[]): VariationIssue[] {
  return nodes.flatMap((node) => {
    const clean = node.text.trim()
    if (!clean) return []

    const variants = variantCount(clean)
    if (variants >= MIN_MESSAGE) return []

    return [
      {
        where: node.label,
        variants,
        message:
          `Este texto sai igual para todo mundo. Escreva ao menos ${MIN_MESSAGE} versões ` +
          `com {opção 1|opção 2} — mensagem idêntica em volume derruba a conta.`,
      },
    ]
  })
}
