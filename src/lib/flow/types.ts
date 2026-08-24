import { z } from 'zod'

/**
 * Um fluxo é um mapa de nós + o id do nó de entrada.
 * O engine caminha nó a nó até bater em algo que pausa (espera resposta / delay) ou termina.
 */

/**
 * Limites da Meta que, estourados, fazem a MENSAGEM INTEIRA ser recusada
 * (erro 100). Mensagem recusada mata o `flow_run` no meio, com as anteriores
 * já entregues — o contato fica com meia conversa. Por isso são limites de
 * schema, não de estilo.
 *
 * Confirmados na documentação do Instagram Platform:
 * - texto de DM: "Message text must be UTF-8 and be a 1000 bytes or less"
 * - texto de button template: "UTF-8-encoded text of up to 640 characters"
 * - payload de postback: "1000 character limit"
 * - card do carrossel: "At least one property must be set in addition to `title`"
 */
export const META_LIMITS = {
  /** Texto de DM comum. BYTES, não caracteres — ver `byteLength`. */
  TEXT_BYTES: 1000,
  /** Texto do button template (o card com até 3 botões). Caracteres. */
  BUTTON_TEMPLATE_CHARS: 640,
  /** `payload` do botão de postback. Caracteres. */
  POSTBACK_PAYLOAD_CHARS: 1000,
  /** Título e subtítulo de card do carrossel. Caracteres. */
  CAROUSEL_TITLE_CHARS: 80,
  /** Título de botão e de quick reply ("up to 20 characters before it is truncated"). */
  BUTTON_TITLE_CHARS: 20,
} as const

/**
 * Medir e cortar moram no mesmo arquivo dos limites de propósito: o builder
 * mede para avisar o dono enquanto ele edita, o envio (`instagram/api.ts`)
 * corta para não morrer. Duas cópias do mesmo número seriam uma delas errada
 * algum dia.
 */
const encoder = new TextEncoder()

/** Bytes UTF-8, que é como a Meta conta o texto. `ã` custa 2, emoji custa 4. */
export function byteLength(text: string): number {
  return encoder.encode(text).length
}

/** Caracteres como gente conta: emoji é 1, e não 2 como em `String.length`. */
export function charLength(text: string): number {
  return [...text].length
}

/**
 * Corta no limite de bytes sem partir caractere ao meio — `for...of` anda por
 * code point, então acento e emoji saem inteiros ou não saem. Cortar um par
 * substituto pela metade produziria UTF-8 inválido, que a Meta recusa igual.
 */
export function truncateBytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text

  let used = 0
  let out = ''
  for (const char of text) {
    const size = byteLength(char)
    if (used + size > maxBytes) break
    used += size
    out += char
  }
  return out
}

/** Corta por caractere (code point), não por unidade UTF-16. */
export function truncateChars(text: string, maxChars: number): string {
  const chars = [...text]
  return chars.length <= maxChars ? text : chars.slice(0, maxChars).join('')
}

/**
 * Mesmo grupo de `spintax.ts` — mudou a sintaxe lá, muda aqui. Duplicado
 * porque `spin()` sorteia, e para medir tamanho o que interessa é o pior caso.
 */
const SPINTAX_GROUP = /\{([^{}|]*(?:\|[^{}|]*)+)\}/g

/**
 * Maior saída possível do spintax: cada `{a|bb|ccc}` vira sua opção mais longa.
 * Medir o template cru rejeitaria texto legítimo — três variantes de 400 bytes
 * somam 1200 no template e nenhuma passa de 400 no envio, e variante aqui é
 * obrigatória para ativar automação (`variation.ts`). O que este cálculo NÃO
 * cobre é `{{nome}}`, cujo valor só existe em tempo de execução; quem cuida
 * disso é o corte no envio (ver o cabeçalho de `instagram/api.ts`).
 *
 * `measure` vem de fora porque "mais longa" muda com a régua: `{ççç|aaaaa}`
 * tem a primeira opção como maior em bytes e a segunda em caracteres, e a
 * Meta usa as duas réguas em campos diferentes.
 */
function longestSpin(text: string, measure: (value: string) => number): string {
  return text.replace(SPINTAX_GROUP, (_match, group: string) =>
    group
      .split('|')
      .reduce((longest, option) => (measure(option) > measure(longest) ? option : longest)),
  )
}

/**
 * Texto que sai como DM. O limite é em BYTES: `ã`, `é` e `ç` custam 2 e emoji
 * custa 4, então ~700 caracteres de português já podem estourar 1000 bytes.
 * `.max(1000)` em caracteres não pegaria isso.
 */
const dmTextSchema = z
  .string()
  .min(1)
  .superRefine((text, ctx) => {
    const bytes = byteLength(longestSpin(text, byteLength))
    if (bytes <= META_LIMITS.TEXT_BYTES) return
    ctx.addIssue({
      code: 'custom',
      message: `Texto passa de ${META_LIMITS.TEXT_BYTES} bytes (tem ${bytes}) — acento conta 2 e emoji conta 4, então cabe menos que ${META_LIMITS.TEXT_BYTES} letras. Acima disso a Meta recusa a mensagem inteira e o fluxo para aqui.`,
    })
  })

/**
 * Texto do button template. Aqui a Meta conta CARACTERES, não bytes, e o teto
 * é outro (640). Não vale somar o limite de DM em cima: texto de 640 letras
 * acentuadas passa de 1000 bytes e ainda assim é legal neste campo.
 */
const buttonTemplateTextSchema = z
  .string()
  .min(1)
  .superRefine((text, ctx) => {
    const chars = charLength(longestSpin(text, charLength))
    if (chars <= META_LIMITS.BUTTON_TEMPLATE_CHARS) return
    ctx.addIssue({
      code: 'custom',
      message: `Texto do bloco de botões passa de ${META_LIMITS.BUTTON_TEMPLATE_CHARS} caracteres (tem ${chars}). Acima disso a Meta recusa a mensagem inteira e o fluxo para aqui.`,
    })
  })

const quickReplySchema = z.object({
  title: z.string().min(1).max(META_LIMITS.BUTTON_TITLE_CHARS),
  payload: z.string().min(1),
})

/**
 * `{{presente}}` sozinho é link válido — só não em tempo de schema. O engine
 * resolve a variável para a página da entrega vinculada antes de enviar
 * (`resolvePresenteUrl` em `engine.ts`), mas `.url()` a rejeita por não ter
 * esquema, e com isso o lugar mais natural do link do presente — o botão —
 * ficava inalcançável pelo editor: quem tentasse salvar levava "Invalid URL"
 * sem explicação. `leaks.ts` já lê `button.url` procurando por ela
 * (`textsOf`), ou seja, o resto do sistema sempre esperou encontrá-la aqui.
 *
 * Só a variável SOZINHA passa. Concatenação (`{{presente}}?utm=x`) continua
 * recusada de propósito: a URL da entrega já vem com o token do contato na
 * query, e colar coisa depois dela produz link quebrado que só aparece na DM.
 */
const DELIVERY_URL_VARIABLE = '{{presente}}'

const buttonUrlSchema = z.string().superRefine((url, ctx) => {
  if (url === DELIVERY_URL_VARIABLE) return
  if (z.string().url().safeParse(url).success) return
  ctx.addIssue({
    code: 'custom',
    message: `Link inválido. Use uma URL completa (começando com https://) ou exatamente ${DELIVERY_URL_VARIABLE}, que vira o link da entrega vinculada à automação.`,
  })
})

const buttonSchema = z.object({
  title: z.string().min(1).max(META_LIMITS.BUTTON_TITLE_CHARS),
  url: buttonUrlSchema.optional(),
  /** Volta no webhook `messaging_postbacks` quando o botão é tocado. */
  payload: z
    .string()
    .optional()
    .superRefine((payload, ctx) => {
      if (payload === undefined) return
      const chars = charLength(payload)
      if (chars <= META_LIMITS.POSTBACK_PAYLOAD_CHARS) return
      ctx.addIssue({
        code: 'custom',
        message: `Payload do botão passa de ${META_LIMITS.POSTBACK_PAYLOAD_CHARS} caracteres (tem ${chars}). Acima disso a Meta recusa a mensagem inteira e o fluxo para aqui.`,
      })
    }),
})

/** Manda texto (com quick replies opcionais) e segue. */
const messageNodeSchema = z.object({
  type: z.literal('message'),
  text: dmTextSchema,
  quickReplies: z.array(quickReplySchema).max(13).optional(),
  next: z.string().nullable().optional(),
})

/** Card com até 3 botões de link ou postback. */
const buttonsNodeSchema = z.object({
  type: z.literal('buttons'),
  text: buttonTemplateTextSchema,
  buttons: z.array(buttonSchema).min(1).max(3),
  next: z.string().nullable().optional(),
})

const carouselCardSchema = z
  .object({
    title: z.string().min(1).max(META_LIMITS.CAROUSEL_TITLE_CHARS),
    subtitle: z.string().max(META_LIMITS.CAROUSEL_TITLE_CHARS).optional(),
    imageUrl: z.string().url().optional(),
    buttons: z.array(buttonSchema).max(3).optional(),
  })
  // "At least one property must be set in addition to `title`" — card só com
  // título passava no schema e voltava erro 100 da Meta, derrubando o fluxo.
  .refine((card) => Boolean(card.subtitle || card.imageUrl || card.buttons?.length), {
    message:
      'Card só com título a Meta recusa, e junto vai a mensagem inteira. Preencha também subtítulo, imagem ou pelo menos um botão.',
  })

/** Carrossel do Instagram (generic template): até 10 cards, cada um com título, subtítulo, imagem e até 3 botões. */
const carouselNodeSchema = z.object({
  type: z.literal('carousel'),
  cards: z.array(carouselCardSchema).min(1).max(10),
  next: z.string().nullable().optional(),
})

/** Pausa o fluxo até o contato responder. A resposta vai para context.vars[saveAs]. */
const waitReplyNodeSchema = z.object({
  type: z.literal('wait_reply'),
  saveAs: z.string().optional(),
  next: z.string().nullable().optional(),
})

const conditionSchema = z.object({
  /** "last_input" ou "vars.foo" ou "tags" */
  source: z.string().min(1),
  op: z.enum(['contains', 'equals', 'starts_with', 'has_tag', 'exists']),
  value: z.string().optional(),
  next: z.string().nullable(),
})

const conditionNodeSchema = z.object({
  type: z.literal('condition'),
  cases: z.array(conditionSchema).min(1),
  fallback: z.string().nullable().optional(),
})

/** Dorme N segundos. O cron retoma. */
const delayNodeSchema = z.object({
  type: z.literal('delay'),
  seconds: z.number().int().positive().max(60 * 60 * 20),
  next: z.string().nullable().optional(),
})

/** Marca ou desmarca tags no contato. */
const tagNodeSchema = z.object({
  type: z.literal('tag'),
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  next: z.string().nullable().optional(),
})

/** Chama um webhook externo (n8n, CRM, checkout). */
const httpNodeSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  method: z.enum(['GET', 'POST']).default('POST'),
  body: z.record(z.string(), z.unknown()).optional(),
  saveAs: z.string().optional(),
  next: z.string().nullable().optional(),
})

/**
 * Formatos que a Meta aceita em cada tipo de anexo (tabela da página
 * "Send Messages" do Instagram Platform). Formato fora da lista = mensagem
 * inteira recusada. Repare que `mp3` NÃO está no áudio: é a extensão que
 * qualquer um escolheria e a que mais deve aparecer na prática.
 *
 * TAMANHO (8 MB imagem, 25 MB o resto) fica SEM validação de propósito: só um
 * HEAD na URL diria quanto o arquivo pesa, e o schema é síncrono. Arquivo
 * grande demais continua falhando só no envio.
 */
const MEDIA_FORMATS = {
  // A Meta lista "jpeg"; na prática a URL vem com `.jpg` ou `.jpeg`.
  image: ['png', 'jpg', 'jpeg'],
  video: ['mp4', 'ogg', 'avi', 'mov', 'webm'],
  audio: ['aac', 'm4a', 'wav', 'mp4'],
  file: ['pdf'],
} as const satisfies Record<string, readonly string[]>

const MEDIA_LABEL = {
  image: 'imagem',
  video: 'vídeo',
  audio: 'áudio',
  file: 'arquivo',
} as const satisfies Record<keyof typeof MEDIA_FORMATS, string>

/**
 * Extensão do CAMINHO da URL. Query string e âncora são descartadas — link
 * assinado (`.../material.pdf?token=abc`) é pdf. Devolve `null` quando não há
 * extensão nenhuma, e também quando a URL nem parseia: reclamar dela é
 * trabalho do `.url()`, não desta checagem.
 */
function urlExtension(url: string): string | null {
  try {
    const match = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname)
    return match ? match[1].toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Anexo por URL pública (a Meta busca o arquivo, não subimos binário).
 * Imagem, vídeo, áudio e arquivo só mudam o `type` do anexo na API — mesmo
 * schema, então uma fábrica evita repetir os quatro campos quatro vezes.
 */
function mediaAttachmentSchema<T extends keyof typeof MEDIA_FORMATS>(type: T) {
  const accepted: readonly string[] = MEDIA_FORMATS[type]

  return z.object({
    type: z.literal(type),
    url: z
      .string()
      .url()
      .superRefine((url, ctx) => {
        const extension = urlExtension(url)
        // URL SEM extensão passa. Link assinado de CDN ou de storage costuma
        // não ter uma (`/object/sign/abc123`) e a Meta resolve o formato pelo
        // Content-Type — recusar aqui barraria link que funciona. Extensão
        // ERRADA é outra coisa: é prova de que o envio vai falhar.
        if (!extension || accepted.includes(extension)) return
        ctx.addIssue({
          code: 'custom',
          message: `.${extension} não é formato de ${MEDIA_LABEL[type]} aceito pelo Instagram — vale só ${accepted.join(', ')}. Com outro, a Meta recusa a mensagem inteira e o fluxo para aqui.`,
        })
      }),
    /** O engine manda a legenda como DM à parte: mesmo limite de texto. */
    caption: dmTextSchema.optional(),
    next: z.string().nullable().optional(),
  })
}

const imageNodeSchema = mediaAttachmentSchema('image')
const videoNodeSchema = mediaAttachmentSchema('video')
const audioNodeSchema = mediaAttachmentSchema('audio')
const fileNodeSchema = mediaAttachmentSchema('file')

/**
 * Pergunta e valida a resposta. Diferente de `wait_reply`, que aceita
 * qualquer coisa: aqui, resposta fora do formato faz o fluxo repreguntar.
 */
const askNodeSchema = z.object({
  type: z.literal('ask'),
  text: dmTextSchema,
  saveAs: z.string().min(1),
  expect: z.enum(['text', 'email', 'phone', 'number']).default('text'),
  /** Sai pela mesma DM da pergunta quando a resposta não valida. */
  retryText: dmTextSchema.optional(),
  /** Tentativas extras antes de desistir e seguir mesmo assim. */
  maxRetries: z.number().int().min(0).max(5).default(2),
  next: z.string().nullable().optional(),
})

/** Grava valores em `contacts.fields` — o que a pessoa respondeu vira dado. */
const setFieldNodeSchema = z.object({
  type: z.literal('set_field'),
  fields: z
    .array(z.object({ key: z.string().min(1), value: z.string() }))
    .min(1),
  next: z.string().nullable().optional(),
})

/** Divide o tráfego entre caminhos — teste A/B. */
const randomizeNodeSchema = z.object({
  type: z.literal('randomize'),
  paths: z
    .array(z.object({ label: z.string().min(1), next: z.string().nullable() }))
    .min(2)
    .max(4),
})

/** Marca o contato como descadastrado; nenhum fluxo dispara mais para ele. */
const unsubscribeNodeSchema = z.object({
  type: z.literal('unsubscribe'),
  next: z.string().nullable().optional(),
})

/**
 * Pula para outro fluxo: encerra o caminho atual e a execução continua na
 * definição do fluxo de destino, com o mesmo `context` (vars, tags já ficam
 * no contato). O engine troca o `flow_id` do `flow_run`; MAX_STEPS segue
 * sendo a trava contra dois fluxos que pulam um para o outro em ciclo.
 */
const gotoFlowNodeSchema = z.object({
  type: z.literal('goto_flow'),
  flowId: z.string().uuid(),
})

const bubbleSchema = z.object({
  text: dmTextSchema,
})

/**
 * Várias mensagens curtas em sequência, com pausa breve entre elas — imita o
 * ritmo de digitação humana em vez de um parágrafo só. Cada bolha passa por
 * spintax e cap de envio próprios, como se fosse um bloco `message` por bolha.
 */
const bubblesNodeSchema = z.object({
  type: z.literal('bubbles'),
  bubbles: z.array(bubbleSchema).min(2).max(5),
  /** Pausa entre bolhas, em ms. Curta de propósito — isto não é o bloco de delay. */
  pauseMs: z.number().int().min(300).max(4000).default(1200),
  next: z.string().nullable().optional(),
})

const endNodeSchema = z.object({
  type: z.literal('end'),
})

export const flowNodeSchema = z.discriminatedUnion('type', [
  messageNodeSchema,
  buttonsNodeSchema,
  carouselNodeSchema,
  bubblesNodeSchema,
  imageNodeSchema,
  videoNodeSchema,
  audioNodeSchema,
  fileNodeSchema,
  askNodeSchema,
  waitReplyNodeSchema,
  conditionNodeSchema,
  delayNodeSchema,
  tagNodeSchema,
  setFieldNodeSchema,
  randomizeNodeSchema,
  httpNodeSchema,
  gotoFlowNodeSchema,
  unsubscribeNodeSchema,
  endNodeSchema,
])

export const flowDefinitionSchema = z.object({
  entry: z.string().min(1),
  nodes: z.record(z.string(), flowNodeSchema),
  /** Posição de cada nó no canvas do builder. O engine ignora. */
  layout: z
    .record(z.string(), z.object({ x: z.number(), y: z.number() }))
    .optional(),
})

export type FlowNode = z.infer<typeof flowNodeSchema>
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>

export interface FlowContext {
  vars: Record<string, string>
  /**
   * Setado quando o fluxo nasceu de um comentário. A primeira mensagem sai como
   * private reply (não exige janela de 24h) e o campo é limpo em seguida.
   */
  pendingCommentId?: string
  lastInput?: string
  /** Nó `ask` que está esperando resposta, e quantas vezes já repreguntou. */
  awaitingAsk?: { nodeId: string; retries: number }
}
