import { z } from 'zod'

/**
 * Saída estruturada da Anthropic com `fetch` cru e validação por Zod.
 *
 * DECISÃO: não trazer `ai` + `@ai-sdk/anthropic` (o projeto de origem usa
 * `generateObject`). O que aquelas duas dependências realmente entregavam aqui
 * era converter o schema Zod em JSON Schema — e o Zod 4, que o projeto já tem,
 * faz isso sozinho com `z.toJSONSchema`. O resto (um POST, ler `usage`, dar
 * `safeParse`) são as ~60 linhas abaixo, contra duas dependências a mais num
 * projeto que tem 11 de propósito e um SDK que quebrou compatibilidade em toda
 * versão maior. Ler `usage.input_tokens`/`output_tokens` direto da resposta
 * ainda é o que preenche `tokens_in`/`tokens_out` em `scripts` sem adaptador.
 *
 * A chave é lida de `process.env` e nunca do Proxy `env`: `env` valida o schema
 * INTEIRO no primeiro acesso e explode sem as variáveis do Instagram/Supabase —
 * o caminho do mock precisa funcionar em teste e em máquina sem `.env`.
 */

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

/** Escolha do dono. Trocável por env sem mexer no código. */
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'

/** Roteiro completo cabe folgado; o teto existe para resposta que não termina nunca. */
const MAX_TOKENS = 4000

/**
 * Uma retentativa, não mais. A primeira falha de schema costuma ser descuido e
 * o modelo corrige quando vê o erro; a segunda costuma ser prompt errado, e aí
 * insistir só queima crédito.
 */
const MAX_ATTEMPTS = 2

/** Geração longa passa de um minuto raramente — acima disso é travamento. */
const TIMEOUT_MS = 120_000

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function model(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
}

/**
 * O JSON Schema que a Anthropic recebe, derivado do MESMO schema que valida a
 * resposta. Derivar em vez de escrever à mão é o que impede os dois de
 * divergirem: campo novo no Zod entra no pedido automaticamente.
 *
 * `$schema` sai porque `input_schema` espera o objeto do schema, não um
 * documento com metadados.
 */
export function toolInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>
  delete json.$schema
  return json
}

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

interface AnthropicResponse {
  model?: string
  content?: Array<{ type: string; [key: string]: unknown }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

type Message =
  | { role: 'user'; content: string | Array<Record<string, unknown>> }
  | { role: 'assistant'; content: Array<Record<string, unknown>> }

export interface StructuredRequest<T> {
  schema: z.ZodType<T>
  system: string
  prompt: string
  /** Nome da ferramenta forçada. Aparece no prompt do modelo, então descreve o resultado. */
  toolName: string
  toolDescription: string
}

export interface StructuredResult<T> {
  output: T
  model: string
  tokensIn: number
  tokensOut: number
}

export class AnthropicError extends Error {}

function firstToolUse(response: AnthropicResponse): ToolUseBlock | null {
  const block = response.content?.find((item) => item.type === 'tool_use')
  return block ? (block as unknown as ToolUseBlock) : null
}

/**
 * Chama a Anthropic obrigando a resposta a sair pela ferramenta — é o que
 * transforma "escreva um JSON" em saída estruturada de verdade, sem cerca de
 * markdown para limpar depois. Mesmo assim a saída passa pelo Zod: o modelo
 * respeita a FORMA da ferramenta, não as regras finas (três ganchos, campo não
 * vazio) que só o schema conhece.
 */
export async function generateStructured<T>(
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new AnthropicError('ANTHROPIC_API_KEY não configurada')

  const inputSchema = toolInputSchema(request.schema)
  const messages: Message[] = [{ role: 'user', content: request.prompt }]

  let tokensIn = 0
  let tokensOut = 0
  let lastIssue = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: model(),
        max_tokens: MAX_TOKENS,
        system: request.system,
        messages,
        tools: [
          {
            name: request.toolName,
            description: request.toolDescription,
            input_schema: inputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: request.toolName },
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new AnthropicError(`Anthropic respondeu ${response.status}: ${detail.slice(0, 500)}`)
    }

    const body = (await response.json()) as AnthropicResponse
    tokensIn += body.usage?.input_tokens ?? 0
    tokensOut += body.usage?.output_tokens ?? 0

    const toolUse = firstToolUse(body)
    if (!toolUse) {
      lastIssue = 'a resposta não veio pela ferramenta'
      continue
    }

    const parsed = request.schema.safeParse(toolUse.input)
    if (parsed.success) {
      return {
        output: parsed.data,
        model: body.model ?? model(),
        tokensIn,
        tokensOut,
      }
    }

    lastIssue = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ')

    // Devolve o erro pelo caminho que o modelo entende — `tool_result` com
    // `is_error` — em vez de recomeçar do zero. Ele já sabe o que escreveu;
    // só falta saber o que estava errado.
    messages.push({ role: 'assistant', content: [toolUse as unknown as Record<string, unknown>] })
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: true,
          content: `A resposta não passou na validação: ${lastIssue}. Corrija e chame a ferramenta de novo.`,
        },
      ],
    })
  }

  throw new AnthropicError(`Resposta inválida depois de ${MAX_ATTEMPTS} tentativas — ${lastIssue}`)
}
