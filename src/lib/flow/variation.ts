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

/**
 * Esconde `{{variavel}}` antes de olhar para os grupos de spintax.
 *
 * No ENVIO a interpolação roda antes do `spin` (ver `deliver` no engine), então
 * `{Oi {{nome}}!|E aí {{nome}}!}` vira `{Oi Pedro!|E aí Pedro!}` e sorteia
 * normalmente — o texto funciona. Mas o validador olha o TEMPLATE cru, e a
 * expressão de grupo não aceita chave dentro: ele contava 1 versão e recusava
 * salvar. O validador rejeitava texto que funciona, e empurrava o dono para a
 * forma `{Oi|E aí} {{nome}}!`, que é válida mas é só UMA das maneiras certas.
 *
 * O sentinela usa caracteres que não aparecem em texto de mensagem; se algum
 * dia aparecerem, o pior caso é contar uma variação a menos.
 */
const VAR_TOKEN = '\u0000var\u0000'

function maskVars(text: string): string {
  return text.replace(/\{\{[^{}]*\}\}/g, VAR_TOKEN)
}

/** Quantas frases diferentes um texto com spintax consegue produzir. */
export function variantCount(text: string): number {
  const groups = maskVars(text).match(/\{[^{}|]*(?:\|[^{}|]*)+\}/g)
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

/**
 * Ponte entre o que a pessoa escreve na tela e a sintaxe de spintax.
 *
 * A trava de variação existe desde a restrição de jul/2026, mas a interface
 * nunca deu como cumpri-la: era um campo de texto só, e o dono teria que
 * digitar `{a|b|c}` de cabeça. Trava que o usuário não consegue satisfazer não
 * é proteção, é beco — ele tentou empilhar uma frase embaixo da outra, que é a
 * leitura natural, e a ferramenta recusou sem ensinar.
 *
 * O modelo simples cobre o caso real: o texto INTEIRO é um grupo de variações.
 * Spintax no meio da frase ("Oi {fulano|amigo}, chegou") continua válido e é
 * mais poderoso, mas não cabe numa lista de campos — por isso `splitVariations`
 * devolve `null` nesse caso, e a tela cai no modo avançado em vez de destruir
 * o que já estava escrito.
 */

/** O texto é um grupo único cobrindo a string toda? Aí vira lista de opções. */
const WHOLE_GROUP = /^\{([^{}]*)\}$/

/**
 * Quebra `{a|b|c}` em `['a','b','c']`. Devolve `null` quando o texto não é um
 * grupo único — texto simples, spintax no meio da frase, ou grupos aninhados.
 */
export function splitVariations(text: string): string[] | null {
  const clean = text.trim()
  if (!clean) return null

  // Casa contra o texto MASCARADO (para `{{nome}}` não quebrar o grupo) e
  // fatia o ORIGINAL nas mesmas posições, para as variáveis voltarem
  // intactas para os campos da tela.
  const masked = maskVars(clean)
  if (!WHOLE_GROUP.test(masked)) return null

  const parts = clean.slice(1, -1).split('|')
  if (parts.length < 2) return null

  return parts
}

/**
 * Junta a lista de volta em spintax. Uma opção só não vira grupo: `{a}` não é
 * spintax, é texto com chaves em volta, e sairia literal para o contato.
 */
export function joinVariations(variations: string[]): string {
  const clean = variations.map((v) => v.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]

  return `{${clean.join('|')}}`
}
