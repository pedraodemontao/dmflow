import { z } from 'zod'

/**
 * Um fluxo é um mapa de nós + o id do nó de entrada.
 * O engine caminha nó a nó até bater em algo que pausa (espera resposta / delay) ou termina.
 */

const quickReplySchema = z.object({
  title: z.string().min(1).max(20),
  payload: z.string().min(1),
})

const buttonSchema = z.object({
  title: z.string().min(1).max(20),
  url: z.string().url().optional(),
  payload: z.string().optional(),
})

/** Manda texto (com quick replies opcionais) e segue. */
const messageNodeSchema = z.object({
  type: z.literal('message'),
  text: z.string().min(1),
  quickReplies: z.array(quickReplySchema).max(13).optional(),
  next: z.string().nullable().optional(),
})

/** Card com até 3 botões de link ou postback. */
const buttonsNodeSchema = z.object({
  type: z.literal('buttons'),
  text: z.string().min(1),
  buttons: z.array(buttonSchema).min(1).max(3),
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

/** Manda uma imagem por URL pública (a Meta busca o arquivo). */
const imageNodeSchema = z.object({
  type: z.literal('image'),
  url: z.string().url(),
  caption: z.string().optional(),
  next: z.string().nullable().optional(),
})

/**
 * Pergunta e valida a resposta. Diferente de `wait_reply`, que aceita
 * qualquer coisa: aqui, resposta fora do formato faz o fluxo repreguntar.
 */
const askNodeSchema = z.object({
  type: z.literal('ask'),
  text: z.string().min(1),
  saveAs: z.string().min(1),
  expect: z.enum(['text', 'email', 'phone', 'number']).default('text'),
  retryText: z.string().optional(),
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

const endNodeSchema = z.object({
  type: z.literal('end'),
})

export const flowNodeSchema = z.discriminatedUnion('type', [
  messageNodeSchema,
  buttonsNodeSchema,
  imageNodeSchema,
  askNodeSchema,
  waitReplyNodeSchema,
  conditionNodeSchema,
  delayNodeSchema,
  tagNodeSchema,
  setFieldNodeSchema,
  randomizeNodeSchema,
  httpNodeSchema,
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
