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

/**
 * MODELO POR TAREFA — a ferramenta precisa caber no bolso para continuar viva.
 *
 * O critério não é "o que é mais importante", é **o que é criativo × o que é
 * estruturado**:
 *
 *   roteiro    → decidir ÂNGULO, gancho e ritmo. Não há resposta certa, e a
 *                diferença entre morno e afiado é a diferença entre um vídeo
 *                que performa e uma tarde de gravação jogada fora. Modelo melhor.
 *   entrega    → cumprir uma promessa já definida, em passo a passo e checklist.
 *                A forma está dada; o trabalho é executar bem. Modelo econômico.
 *   carrossel  → o ângulo já foi decidido ANTES (é o pilar/tema, o `modeledOn`
 *                ou o próprio roteiro em `fromScript`) — o trabalho daqui é
 *                encaixar uma ideia por slide dentro de um teto de caractere
 *                rígido (`schemas.ts`, render sem shrink-to-fit). Mais perto de
 *                "executar bem uma forma dada" do que de "inventar ângulo", e
 *                por isso desce para o modelo econômico como a entrega — não é
 *                cópia por reflexo do roteiro, é o mesmo raciocínio aplicado.
 *
 * Repare que a entrega NÃO é menor: a primeira gerou 21 blocos, mais saída que
 * o roteiro. Ela é mais FÁCIL, não mais curta — e por isso desce um degrau, não
 * dois. É o material que o lead lê inteiro, a promessa do vídeo sendo cumprida;
 * economizar até o fundo aqui entrega ao lead um PDF morno com o nome do dono.
 *
 * Medido na primeira geração real: roteiro 4.426 de entrada e 1.416 de saída.
 * Volume de alguns por semana, não por minuto.
 */
const MODEL_BY_TASK = {
  /** Roteiro de vídeo: a peça criativa. */
  script: 'claude-opus-5',
  /** Material de entrega: a peça estruturada. */
  delivery: 'claude-sonnet-5',
  /** Legenda de post a partir da foto: peça curta, forma dada — econômico. */
  caption: 'claude-sonnet-5',
  /** Clonagem por visão: extrair estrutura de prints é transcrição guiada — econômico. */
  clone: 'claude-sonnet-5',
  /** Carrossel: forma fixa, teto de caractere por slide — estruturado como a entrega. */
  carousel: 'claude-sonnet-5',
} as const

export type AiTask = keyof typeof MODEL_BY_TASK

/**
 * Teto por tarefa. Existe contra resposta que não termina nunca — mas apertado
 * demais ele corta a resposta no meio, e resposta cortada não falha como
 * "faltou espaço": falha como "campo obrigatório ausente".
 *
 * A entrega é a peça longa das duas: uma delas veio com 18 blocos. O roteiro
 * tem estrutura fixa (ganchos, beats, CTAs) e não cresce assim.
 *
 * O carrossel tem TETO DE VERDADE — 10 slides × (60 + 220 caracteres) + legenda
 * de 2.200 é o pior caso absoluto do schema, uns 5 mil caracteres de conteúdo.
 * 3.000 tokens sobra folga para a pontuação do JSON em cima disso sem chegar
 * perto do teto do roteiro, que não tem tal cerca (beats de tamanho livre).
 */
// clone: 5000 e não 3000 — transcrever 10 slides densos no modo copiar passa
// de 3000, e resposta cortada falha como "campo ausente", queimando a
// retentativa. Teto é proteção, não gasto: só se paga o que sai.
const MAX_TOKENS_BY_TASK = { script: 4000, delivery: 8000, carousel: 3000, caption: 1200, clone: 5000 } as const

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

/**
 * Qual modelo para qual tarefa, com saídas de emergência sem deploy:
 *
 *   ANTHROPIC_MODEL_SCRIPT / ANTHROPIC_MODEL_DELIVERY / ANTHROPIC_MODEL_CAROUSEL  — por tarefa
 *   ANTHROPIC_MODEL                                                              — atropela todas
 *
 * O override geral existe para o dia em que um modelo sair do ar: uma variável
 * e tudo volta a funcionar, sem esperar build. Lookup por objeto, não `if`
 * encadeado, para tarefa nova não exigir mais um ramo aqui — só a entrada em
 * `MODEL_BY_TASK` e a env var por tarefa, se quiser o override.
 */
function model(task: AiTask = 'script'): string {
  const geral = process.env.ANTHROPIC_MODEL
  if (geral) return geral

  const overridePorTarefa: Record<AiTask, string | undefined> = {
    script: process.env.ANTHROPIC_MODEL_SCRIPT,
    delivery: process.env.ANTHROPIC_MODEL_DELIVERY,
    carousel: process.env.ANTHROPIC_MODEL_CAROUSEL,
    caption: process.env.ANTHROPIC_MODEL_CAPTION,
    clone: process.env.ANTHROPIC_MODEL_CLONE,
  }

  return overridePorTarefa[task] || MODEL_BY_TASK[task]
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
  /**
   * `max_tokens` aqui significa RESPOSTA CORTADA NO MEIO, e o sintoma é
   * enganoso: o JSON da ferramenta chega incompleto e o Zod acusa um campo
   * faltando ("title: expected string, received undefined"), como se o modelo
   * tivesse desobedecido o schema. Sem ler isto, a mensagem manda quem
   * investiga para o prompt quando o problema é o teto.
   */
  stop_reason?: string
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
  /** Qual tarefa — decide o modelo. Omitir vale como `script`, o mais capaz. */
  task?: AiTask
  /**
   * Imagens que entram ANTES do texto do prompt — é a ordem que a própria
   * Anthropic recomenda para visão. Base64 cru, sem o prefixo data:.
   */
  images?: Array<{ mediaType: 'image/jpeg' | 'image/png'; base64: string }>
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
  const content: string | Array<Record<string, unknown>> =
    request.images && request.images.length > 0
      ? [
          ...request.images.map((image) => ({
            type: 'image',
            source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
          })),
          { type: 'text', text: request.prompt },
        ]
      : request.prompt
  const messages: Message[] = [{ role: 'user', content }]

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
        model: model(request.task),
        max_tokens: MAX_TOKENS_BY_TASK[request.task ?? 'script'],
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
      lastIssue =
        body.stop_reason === 'max_tokens'
          ? `a resposta estourou o teto de ${MAX_TOKENS_BY_TASK[request.task ?? 'script']} tokens e veio cortada`
          : 'a resposta não veio pela ferramenta'
      continue
    }

    // Truncamento ANTES do Zod: um JSON cortado no meio produz erro de campo
    // faltando, que descreve o sintoma e esconde a causa.
    if (body.stop_reason === 'max_tokens') {
      lastIssue = `a resposta estourou o teto de ${MAX_TOKENS_BY_TASK[request.task ?? 'script']} tokens e veio cortada`
      continue
    }

    const parsed = request.schema.safeParse(toolUse.input)
    if (parsed.success) {
      return {
        output: parsed.data,
        model: body.model ?? model(request.task),
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
