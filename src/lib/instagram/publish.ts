import { MetaSendError, type MetaErrorBody } from '@/lib/instagram/errors'
import type { PublicationKind } from '@/types/db'

/**
 * Publicação de conteúdo pela Instagram API com Instagram Login (card 04).
 *
 * Mesmo host de `api.ts`: o token vem do Instagram Login, e é ele que
 * `graph.instagram.com` aceita. `graph.facebook.com` é para Page token de
 * Facebook Login — outro OAuth, que não é o nosso — e responde `code 190`
 * sem dizer por quê.
 *
 * O caminho da Meta tem três passos, e o meio é assíncrono:
 *
 *   POST /{ig-user-id}/media           → container (a Meta baixa a mídia)
 *   GET  /{container-id}?status_code   → IN_PROGRESS … FINISHED
 *   POST /{ig-user-id}/media_publish   → o post, com o id definitivo
 *
 * O que este arquivo garante, e o motivo:
 *
 * - **Container criado nunca é recriado.** `publishPublication` chama
 *   `persist` depois de CADA container, e na entrada reaproveita o que já
 *   está em `container_ids`. Se o tick morrer entre criar e publicar (vídeo
 *   processa por minutos, `maxDuration` é 300s), a retentativa que recriasse
 *   do zero produziria post DUPLICADO quando o anterior também chegasse a
 *   publicar. É o mesmo princípio de `startFlow` retomando run `failed` pelo
 *   `current_node` em vez de recomeçar do `entry`.
 * - **Container já `PUBLISHED` não passa por `media_publish` de novo.** Acontece
 *   quando o publish deu certo e a gravação do resultado falhou. Republicar
 *   é o post em dobro; parar com erro permanente e mensagem clara é o dono
 *   conferir no Instagram.
 * - **Espera tem orçamento, e estourar é transitório.** O container continua
 *   lá; a próxima rodada retoma pelo id. O orçamento (120s) fica bem abaixo
 *   dos 10 min que a drenagem usa para considerar um `publishing` travado —
 *   um tick vivo esperando vídeo nunca pode ser "destravado" por outro.
 *
 * Erros da Graph saem como `MetaSendError` (mesma forma de corpo que o
 * envio de DM) e seguem a regra de ouro de `errors.ts`: desconhecido é
 * transitório. Não há lista de códigos de publicação aqui de propósito —
 * entra quando aparecer numa resposta real, com data e mensagem.
 */

const GRAPH = 'https://graph.instagram.com/v23.0'

/** Quanto tempo uma rodada espera um container ficar pronto. */
export const CONTAINER_WAIT_BUDGET_MS = 120_000
const CONTAINER_POLL_MS = 4_000

/** Limites da Meta para carrossel. Fora disso o container é recusado. */
export const CAROUSEL_MIN_ITEMS = 2
export const CAROUSEL_MAX_ITEMS = 10

export type ContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED'

/** O que já existe do lado da Meta para esta publicação. Vive em `publications.container_ids`. */
export interface ContainerIds {
  children?: string[]
  parent?: string
}

/**
 * Erro de publicação que não vem com corpo da Graph: container que a Meta
 * marcou como ERROR/EXPIRED, orçamento de espera estourado, container já
 * publicado. `permanent` decide se a drenagem retenta ou desiste.
 */
export class PublishError extends Error {
  readonly permanent: boolean

  constructor(message: string, permanent: boolean) {
    super(message)
    this.name = 'PublishError'
    this.permanent = permanent
  }
}

/** `true` quando insistir não vai adiantar — seja erro da Graph, seja do container. */
export function isPermanentPublishError(error: unknown): boolean {
  if (error instanceof MetaSendError) return error.permanent
  if (error instanceof PublishError) return error.permanent
  return false
}

interface Credentials {
  igUserId: string
  accessToken: string
}

function withToken(path: string, accessToken: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ ...params, access_token: accessToken })
  return `${GRAPH}${path}?${search}`
}

/**
 * Token na query string, não no corpo nem em header: é o formato dos
 * exemplos oficiais da API de publicação e o que `insights.ts` já usa. O
 * corpo fica só com os campos do container.
 */
async function graphPost<T>(path: string, accessToken: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(withToken(path, accessToken), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  return parse<T>(res)
}

async function graphGet<T>(path: string, accessToken: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(withToken(path, accessToken, params), { cache: 'no-store' })
  return parse<T>(res)
}

async function parse<T>(res: Response): Promise<T> {
  const raw = await res.text()
  const json = (() => {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  })()

  if (!res.ok) {
    throw new MetaSendError({ status: res.status, body: json as MetaErrorBody, raw })
  }
  return json as T
}

interface Created {
  id: string
}

/** Imagem solta ou item de carrossel. JPEG público; item de carrossel não leva legenda. */
export function createImageContainer(
  args: Credentials & { imageUrl: string; caption?: string; isCarouselItem?: boolean },
): Promise<Created> {
  const body: Record<string, string> = { image_url: args.imageUrl }
  if (args.isCarouselItem) body.is_carousel_item = 'true'
  else if (args.caption) body.caption = args.caption
  return graphPost<Created>(`/${args.igUserId}/media`, args.accessToken, body)
}

export function createCarouselContainer(
  args: Credentials & { children: string[]; caption: string },
): Promise<Created> {
  return graphPost<Created>(`/${args.igUserId}/media`, args.accessToken, {
    media_type: 'CAROUSEL',
    children: args.children.join(','),
    caption: args.caption,
  })
}

export function createReelContainer(
  args: Credentials & { videoUrl: string; caption: string; coverUrl?: string | null },
): Promise<Created> {
  const body: Record<string, string> = {
    media_type: 'REELS',
    video_url: args.videoUrl,
    caption: args.caption,
  }
  if (args.coverUrl) body.cover_url = args.coverUrl
  return graphPost<Created>(`/${args.igUserId}/media`, args.accessToken, body)
}

export interface ContainerState {
  status_code?: ContainerStatus
  /** Texto livre da Meta — é o que explica um ERROR. */
  status?: string
}

export function getContainerStatus(args: { containerId: string; accessToken: string }): Promise<ContainerState> {
  return graphGet<ContainerState>(`/${args.containerId}`, args.accessToken, {
    fields: 'status_code,status',
  })
}

/**
 * Espera o container ficar `FINISHED`.
 *
 * Devolve o status final para quem chama decidir: `PUBLISHED` volta sem erro
 * porque a decisão de não republicar é do orquestrador, não daqui.
 * `ERROR`/`EXPIRED` é permanente — a Meta desistiu da mídia, e insistir com
 * o mesmo container só repete a resposta. Orçamento estourado é transitório:
 * o container continua processando do lado dela.
 */
export async function waitUntilFinished(args: {
  containerId: string
  accessToken: string
  budgetMs?: number
  pollMs?: number
}): Promise<'FINISHED' | 'PUBLISHED'> {
  const budgetMs = args.budgetMs ?? CONTAINER_WAIT_BUDGET_MS
  const pollMs = args.pollMs ?? CONTAINER_POLL_MS
  const deadline = Date.now() + budgetMs

  for (;;) {
    const state = await getContainerStatus(args)

    if (state.status_code === 'FINISHED' || state.status_code === 'PUBLISHED') return state.status_code
    if (state.status_code === 'ERROR' || state.status_code === 'EXPIRED') {
      throw new PublishError(
        `Container ${args.containerId} terminou em ${state.status_code}${state.status ? `: ${state.status}` : ''}`,
        true,
      )
    }

    if (Date.now() >= deadline) {
      throw new PublishError(
        `Container ${args.containerId} ainda em ${state.status_code ?? 'estado desconhecido'} depois de ${Math.round(budgetMs / 1000)}s`,
        false,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

export function publishContainer(args: Credentials & { creationId: string }): Promise<Created> {
  return graphPost<Created>(`/${args.igUserId}/media_publish`, args.accessToken, {
    creation_id: args.creationId,
  })
}

export interface PublishingQuota {
  used: number
  total: number
}

/** Uso da cota da própria Meta (100 publicações por API a cada 24h). */
export async function fetchPublishingQuota(args: Credentials): Promise<PublishingQuota> {
  const json = await graphGet<{
    data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }>
  }>(`/${args.igUserId}/content_publishing_limit`, args.accessToken, {
    fields: 'quota_usage,config',
  })
  const row = json.data?.[0]
  return { used: row?.quota_usage ?? 0, total: row?.config?.quota_total ?? 100 }
}

/** `null` quando a Meta não devolve — permalink é enfeite na lista, nunca condição. */
export async function fetchPermalink(args: { mediaId: string; accessToken: string }): Promise<string | null> {
  try {
    const json = await graphGet<{ permalink?: string }>(`/${args.mediaId}`, args.accessToken, {
      fields: 'permalink',
    })
    return json.permalink ?? null
  } catch {
    return null
  }
}

export interface PublishPublicationArgs extends Credentials {
  kind: PublicationKind
  caption: string
  /** URLs públicas, na ordem dos slides. Reel e imagem: uma só. */
  mediaUrls: string[]
  coverUrl?: string | null
  containerIds: ContainerIds
  /** Chamado depois de CADA container criado, antes de seguir. É a retomada. */
  persist: (ids: ContainerIds) => Promise<void>
  budgetMs?: number
  pollMs?: number
}

/**
 * Orquestra a publicação inteira, retomando de `containerIds`.
 *
 * A ordem em que `persist` é chamado importa: sempre DEPOIS de a Meta
 * devolver o id e ANTES de qualquer passo seguinte. Gravar antes de criar
 * registraria um id que não existe; gravar depois do passo seguinte deixaria
 * uma janela em que o tick morre com container criado e não anotado.
 */
export async function publishPublication(args: PublishPublicationArgs): Promise<{ platformMediaId: string }> {
  const ids: ContainerIds = { ...args.containerIds, children: [...(args.containerIds.children ?? [])] }
  const creds = { igUserId: args.igUserId, accessToken: args.accessToken }
  const wait = (containerId: string) =>
    waitUntilFinished({ containerId, accessToken: args.accessToken, budgetMs: args.budgetMs, pollMs: args.pollMs })

  if (!ids.parent) {
    if (args.kind === 'carousel') {
      if (args.mediaUrls.length < CAROUSEL_MIN_ITEMS || args.mediaUrls.length > CAROUSEL_MAX_ITEMS) {
        throw new PublishError(
          `Carrossel precisa de ${CAROUSEL_MIN_ITEMS} a ${CAROUSEL_MAX_ITEMS} imagens, recebeu ${args.mediaUrls.length}`,
          true,
        )
      }
      const children = ids.children ?? []
      for (let i = children.length; i < args.mediaUrls.length; i += 1) {
        const created = await createImageContainer({ ...creds, imageUrl: args.mediaUrls[i], isCarouselItem: true })
        children.push(created.id)
        ids.children = children
        await args.persist(ids)
      }
      for (const child of children) await wait(child)

      const parent = await createCarouselContainer({ ...creds, children, caption: args.caption })
      ids.parent = parent.id
      await args.persist(ids)
    } else {
      if (args.mediaUrls.length !== 1) {
        throw new PublishError(`${args.kind} leva exatamente uma mídia, recebeu ${args.mediaUrls.length}`, true)
      }
      const created =
        args.kind === 'reel'
          ? await createReelContainer({ ...creds, videoUrl: args.mediaUrls[0], caption: args.caption, coverUrl: args.coverUrl })
          : await createImageContainer({ ...creds, imageUrl: args.mediaUrls[0], caption: args.caption })
      ids.parent = created.id
      await args.persist(ids)
    }
  }

  const status = await wait(ids.parent)
  if (status === 'PUBLISHED') {
    throw new PublishError(
      `Container ${ids.parent} já consta como publicado na Meta; confira o post no Instagram antes de tentar de novo`,
      true,
    )
  }

  const published = await publishContainer({ ...creds, creationId: ids.parent })
  return { platformMediaId: published.id }
}
