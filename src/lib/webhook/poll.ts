import { supabaseAdmin } from '@/lib/supabase/admin'
import { enqueue, processPending, type CommentValue, type MessagingValue } from '@/lib/webhook/process'
import type { Account } from '@/types/db'

/**
 * Fallback de polling: busca comentários e DMs recentes direto na API e
 * alimenta a MESMA fila do webhook. Existe porque a entrega de webhooks da
 * Meta pode falhar silenciosamente; a leitura, não. O dedup_key da fila
 * (comment:<id> / msg:<mid>) torna webhook e polling idempotentes entre si.
 */

const GRAPH = 'https://graph.instagram.com/v23.0'

/**
 * Teto de segurança quando não há cursor (primeira varredura). Com cursor, a
 * janela é "desde a última varredura que deu certo" — é isso que faz o sistema
 * se recuperar de uma parada longa em vez de perder o que passou nela.
 */
const FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000
/** Quanto o cursor recua ao retomar: cobre comentário que chegou fora de ordem. */
const CURSOR_OVERLAP_MS = 5 * 60 * 1000
/** Páginas de mídia por rodada. Cada página traz 25 — 8 páginas = 200 posts. */
const MEDIA_PAGES = 8

/**
 * ORDEM DA EDGE DE COMENTÁRIOS — a premissa que sustenta o teto abaixo.
 *
 *   "Requests made using API version 3.1 or older will have results returned
 *    in chronological order. Requests made using version 3.2+ will have
 *    results returned in reverse chronological order."
 *   — https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments/
 *
 * `GRAPH` acima é v23.0, logo MAIS NOVO PRIMEIRO. É só isso que faz
 * "20 páginas × 25" significar "os 500 comentários MAIS RECENTES" em vez de
 * "os 500 mais antigos". Num post com 3.000 comentários, ordem crescente
 * colocaria os novos na página ~120: o post ficaria permanentemente mudo
 * enquanto o cursor avança por cima, sem erro e sem log. Se um dia alguém
 * baixar a versão na URL para 3.1 ou anterior, este arquivo quebra em
 * silêncio — a versão é parte da correção, não detalhe de configuração.
 *
 * A mesma página fecha as duas saídas fáceis: não dá para estreitar a busca
 * por data ("Comments cannot be filtered by timestamp" — daí o filtro por
 * `cutoff` ser do nosso lado) e o teto por página é 50 ("Returns a maximum of
 * 50 comments per query"). Ficamos em 25 de propósito: cada item agora traz a
 * thread inteira junto (ver COMMENT_FIELDS) e o corpo da resposta já cresce
 * por aí.
 */
const COMMENT_PAGES = 20
const COMMENTS_PER_PAGE = 25

/**
 * Respostas DENTRO da thread vêm por EXPANSÃO DE CAMPO, no mesmo request do
 * comentário-pai — e não numa chamada por comentário.
 *
 * A edge `/{media}/comments` "returns only top-level comments. Replies to
 * comments are not included unless you use field expansion to request the
 * `replies` field" (mesma página citada acima). Sem isso, o caso mais comum do
 * produto era invisível: o bot responde publicamente "te mandei no direct 👀"
 * e a pessoa responde DENTRO daquela thread — o que nunca aparece em primeiro
 * nível, e portanto nunca era varrido.
 *
 * O caminho óbvio (`GET /{comment}/replies` por comentário) multiplicaria o
 * custo do tick pelo número de comentários lidos: hoje já são ~200 posts ×
 * até 20 páginas, e viraria isso vezes 25. A expansão de campo custa ZERO
 * requisição a mais — o preço é só um corpo de resposta maior, que é o que o
 * `COMMENTS_PER_PAGE` menor compensa.
 *
 * Limite conhecido: a ordem dentro de `replies` não é documentada, então uma
 * thread com mais de REPLIES_PER_COMMENT respostas pode truncar. Thread desse
 * tamanho embaixo de uma resposta do bot é raro; ler mais que isso por
 * comentário-pai encareceria o corpo sem ganho proporcional.
 */
const REPLIES_PER_COMMENT = 25
const COMMENT_FIELDS = `id,text,timestamp,username,from,replies.limit(${REPLIES_PER_COMMENT}){id,text,timestamp,username,from}`

/**
 * Conversas por página e páginas por rodada. Antes era UMA chamada com
 * `limit=15` e sem paginação nenhuma: 25 pessoas mandando DM no mesmo minuto
 * — o que acontece quando um post estoura — deixava 10 de fora e o cursor
 * avançava por cima. As 10 DMs sumiam. É o mesmo buraco que a migration 0009
 * fechou para comentários e que ficou aberto para DM.
 *
 * Aqui não há parada antecipada por data como poderia haver em comentários: a
 * ordem da edge de conversas não é documentada, e apostar em comportamento
 * observado para decidir onde parar de ler é como se perde evento em silêncio.
 * O teto de páginas é a única trava, e 200 conversas por rodada de um minuto
 * é folga de sobra.
 */
const CONVERSATION_PAGES = 8
const CONVERSATIONS_PER_PAGE = 25
/** Mensagens por conversa. 5 não cobria quem manda várias seguidas. */
const MESSAGES_PER_CONVERSATION = 25

interface RawComment {
  id: string
  text?: string
  timestamp?: string
  username?: string
  from?: { id?: string; username?: string }
  replies?: { data?: RawComment[] }
}

/**
 * Erro que impede a varredura de acontecer — token morto, conta bloqueada,
 * Meta fora do ar, fila que não aceita escrita. Diferente de "varri e não
 * achei nada", que é sucesso.
 *
 * Em 30/07 o token foi invalidado e esta função devolvia `null` para tudo:
 * o tick reportava sucesso por 22 horas com o sistema morto.
 */
export class PollError extends Error {
  constructor(public readonly detail: string) {
    super(detail)
  }
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new PollError(body.error?.message ?? `HTTP ${res.status} em ${new URL(url).pathname}`)
  }

  return res.json() as Promise<T>
}

interface Paged<T> {
  data?: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

/** Segue a paginação da Graph API até acabar ou bater o teto de páginas. */
async function fetchAllPages<T>(
  baseUrl: string,
  token: string,
  maxPages: number,
): Promise<T[]> {
  const all: T[] = []
  let url: string | undefined = baseUrl

  for (let page = 0; page < maxPages && url; page += 1) {
    const res: Paged<T> = await fetchJson<Paged<T>>(url, token)
    if (res.data?.length) all.push(...res.data)

    const after = res.paging?.cursors?.after
    // Sem cursor de próxima página, acabou.
    url = res.paging?.next && after ? `${baseUrl}&after=${after}` : undefined
  }

  return all
}

function isBefore(timestamp: string | undefined, cutoff: number): boolean {
  return timestamp !== undefined && new Date(timestamp).getTime() < cutoff
}

type Authorship = 'lead' | 'self' | 'unknown'

/**
 * De quem é o comentário, do ponto de vista da automação.
 *
 * `unknown` é a Meta devolvendo o item sem `from` e sem `username`. Em
 * primeiro nível isso é inofensivo e o comentário passa: a conta não comenta
 * o próprio post por fora de uma thread, então ali "não sei quem é" quer
 * dizer "é um lead sem consentimento de perfil".
 *
 * Dentro de uma thread a leitura se inverte, porque é exatamente lá que mora
 * a resposta pública que o bot acabou de publicar. Por isso quem chama trata
 * `unknown` como `self` na thread: deixar passar é a mesma classe de bug do
 * `is_echo` — o bot disparando fluxo em cima da própria resposta, em laço.
 */
function authorshipOf(account: Account, comment: RawComment): Authorship {
  const fromId = comment.from?.id
  if (fromId) return fromId === account.ig_user_id ? 'self' : 'lead'

  const username = comment.from?.username ?? comment.username
  if (username) return username === account.username ? 'self' : 'lead'

  return 'unknown'
}

type CommentEvent = {
  dedupKey: string
  igAccountId: string
  kind: 'comment'
  value: CommentValue
}

function toCommentEvent(
  account: Account,
  comment: RawComment,
  mediaId: string,
  /** Preenchido só para resposta dentro de thread. */
  parentId?: string,
): CommentEvent {
  const fromId = comment.from?.id
  const fromUsername = comment.from?.username ?? comment.username

  return {
    dedupKey: `comment:${comment.id}`,
    igAccountId: account.ig_user_id,
    kind: 'comment',
    value: {
      id: comment.id,
      text: comment.text ?? '',
      // Sem `from.id` a API ainda permite private reply (recipient é o
      // comment_id); usamos o id do comentário como identidade provisória
      // do contato até a primeira DM dele chegar.
      from: { id: fromId ?? `comment_author:${comment.id}`, username: fromUsername },
      media: { id: mediaId },
      // De qual thread veio. O campo já existia em CommentValue e nunca era
      // preenchido, porque nada além do primeiro nível era varrido.
      ...(parentId ? { parent_id: parentId } : {}),
    },
  }
}

async function pollComments(account: Account): Promise<number> {
  const media = await fetchAllPages<{ id: string; timestamp?: string }>(
    `${GRAPH}/me/media?fields=id,timestamp&limit=25`,
    account.access_token,
    MEDIA_PAGES,
  )
  if (!media.length) return 0

  // Janela: desde o cursor (menos uma folga), ou a última hora na primeira vez.
  const cutoff = account.comments_cursor
    ? new Date(account.comments_cursor).getTime() - CURSOR_OVERLAP_MS
    : Date.now() - FIRST_RUN_LOOKBACK_MS

  const events: CommentEvent[] = []
  let unattributedReplies = 0

  for (const item of media) {
    const comments = await fetchAllPages<RawComment>(
      `${GRAPH}/${item.id}/comments?fields=${COMMENT_FIELDS}&limit=${COMMENTS_PER_PAGE}`,
      account.access_token,
      COMMENT_PAGES,
    )

    for (const comment of comments) {
      if (!isBefore(comment.timestamp, cutoff) && authorshipOf(account, comment) !== 'self') {
        events.push(toCommentEvent(account, comment, item.id))
      }

      // Thread: o comentário-pai pode ser antigo e ainda receber resposta
      // agora, então a idade do pai não filtra as respostas dele.
      for (const reply of comment.replies?.data ?? []) {
        if (isBefore(reply.timestamp, cutoff)) continue

        const author = authorshipOf(account, reply)
        if (author === 'self') continue
        if (author === 'unknown') {
          unattributedReplies += 1
          continue
        }

        events.push(toCommentEvent(account, reply, item.id, comment.id))
      }
    }
  }

  if (unattributedReplies > 0) {
    // Não é erro — é captura descartada de propósito (ver `authorshipOf`).
    // Mas se aparecer em toda rodada, a Meta parou de mandar `from`/`username`
    // dentro da expansão e NENHUMA resposta em thread está sendo lida.
    console.warn(
      '[dm-flow] respostas em thread ignoradas por autoria desconhecida:',
      account.username ?? account.ig_user_id,
      unattributedReplies,
    )
  }

  // `enqueue` LANÇA quando a gravação falha. Era essa a intenção do código
  // original — "só avança o cursor depois de a varredura inteira ter dado
  // certo" —, mas ela só valia para erro que lança, e o `upsert()` do
  // supabase-js RESOLVE com `{ error }` em vez de lançar. Com o retorno
  // ignorado, uma falha de banco (payload grande, timeout, pool esgotado)
  // deixava a varredura seguir e gravar o cursor por cima: aqueles
  // comentários nunca entravam na fila, nunca mais eram varridos, e o tick
  // respondia `ok:true`.
  await enqueue(events)

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({ comments_cursor: new Date().toISOString() })
    .eq('id', account.id)

  // Falhar AQUI não perde comentário: o cursor fica onde estava e a próxima
  // rodada varre a mesma janela de novo, com o `dedup_key` absorvendo o
  // reprocesso. Erra para o lado seguro, então vira log e não derruba o tick —
  // 503 seria alarme vermelho para um problema que se conserta sozinho.
  if (error) {
    console.error(
      '[dm-flow] cursor de comentários não avançou:',
      account.username ?? account.ig_user_id,
      error.message,
    )
  }

  return events.length
}

interface RawMessage {
  id: string
  created_time?: string
  from?: { id?: string; username?: string }
  message?: string
}

async function pollMessages(account: Account): Promise<number> {
  const conversations = await fetchAllPages<{ messages?: { data?: RawMessage[] } }>(
    `${GRAPH}/me/conversations?fields=messages.limit(${MESSAGES_PER_CONVERSATION}){id,created_time,from,message}&limit=${CONVERSATIONS_PER_PAGE}`,
    account.access_token,
    CONVERSATION_PAGES,
  )
  if (!conversations.length) return 0

  const cutoff = account.messages_cursor
    ? new Date(account.messages_cursor).getTime() - CURSOR_OVERLAP_MS
    : Date.now() - FIRST_RUN_LOOKBACK_MS
  const events: Array<{ dedupKey: string; igAccountId: string; kind: 'messaging'; value: MessagingValue }> = []

  for (const conversation of conversations) {
    for (const message of conversation.messages?.data ?? []) {
      if (!message.from?.id || message.from.id === account.ig_user_id) continue
      if (isBefore(message.created_time, cutoff)) continue

      events.push({
        dedupKey: `msg:${message.id}`,
        igAccountId: account.ig_user_id,
        kind: 'messaging',
        value: {
          sender: { id: message.from.id },
          message: { mid: message.id, text: message.message ?? '' },
        },
      })
    }
  }

  // Mesmo contrato de pollComments: se a fila recusar a escrita, o erro sobe e
  // o cursor não avança — a DM é revarrida na próxima rodada em vez de sumir.
  await enqueue(events)

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({ messages_cursor: new Date().toISOString() })
    .eq('id', account.id)

  if (error) {
    console.error(
      '[dm-flow] cursor de mensagens não avançou:',
      account.username ?? account.ig_user_id,
      error.message,
    )
  }

  return events.length
}

export interface PollResult {
  comments: number
  messages: number
  processed: number
  /** Contas que não deu nem para varrer. Vazio = varredura saudável. */
  errors: Array<{ account: string; detail: string }>
}

export async function pollAll(): Promise<PollResult> {
  const { data, error } = await supabaseAdmin.from('accounts').select('*').eq('is_active', true)
  const accounts = (data ?? []) as Account[]

  let comments = 0
  let messages = 0
  const errors: PollResult['errors'] = []

  // Não conseguir NEM LISTAR as contas é o sistema parado, não um tick
  // tranquilo. O erro vinha sendo descartado: com o banco instável `data` volta
  // null, o laço abaixo não roda, `errors` fica vazio e a rota responde 200
  // `ok:true` com zero eventos — o incidente de 30/07 (22 horas de silêncio
  // reportando sucesso) entrando pela porta do banco em vez da porta da Meta.
  // A guarda de 503 no tick só cobria falha da Meta; agora cobre esta também.
  //
  // Zero conta ativa SEM erro continua sendo sucesso de propósito: é o estado
  // legítimo de quem ainda não conectou (ou desconectou) a conta pelo painel,
  // e alarmar nele faria o cron piscar vermelho por decisão do dono.
  if (error) {
    errors.push({ account: '(lista de contas)', detail: error.message })
  }

  for (const account of accounts) {
    const name = account.username ?? account.ig_user_id

    try {
      comments += await pollComments(account)
    } catch (pollError) {
      const detail = pollError instanceof Error ? pollError.message : String(pollError)
      console.error('[dm-flow] poll de comentários falhou:', name, detail)
      errors.push({ account: name, detail })
    }

    try {
      messages += await pollMessages(account)
    } catch (pollError) {
      const detail = pollError instanceof Error ? pollError.message : String(pollError)
      console.error('[dm-flow] poll de mensagens falhou:', name, detail)
      errors.push({ account: name, detail })
    }
  }

  // A fila é varrida mesmo sem novidade: pode haver evento adiado por
  // silêncio, por pânico ou por cap que já venceu.
  const processed = await processPending(50)
  return { comments, messages, processed, errors }
}
