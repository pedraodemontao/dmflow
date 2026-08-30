import { env } from '@/lib/env'
import { isQuiet } from '@/lib/flow/quiet-hours'
import {
  PublishError,
  fetchPermalink,
  fetchPublishingQuota,
  isPermanentPublishError,
  publishPublication,
  type ContainerIds,
} from '@/lib/instagram/publish'
import { publicationMediaUrl } from '@/lib/publications/media-url'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Account, Publication } from '@/types/db'

/**
 * A drenagem das publicações agendadas — roda no tick, ao lado da fila de
 * respostas públicas (card 04, fase 3).
 *
 * As mesmas regras da fila de resposta pública, pelos mesmos incidentes:
 *
 * - **Adiar não é falhar.** Pausa, silêncio, cap diário e cota da Meta saem
 *   com `continue` ANTES do claim e fora do `try` — nunca incrementam
 *   `attempts`. Em `drainPublicReplies`, o cap dentro do `try` levou a fila
 *   inteira ao teto de tentativas em cinco ticks de rajada, e ela sumiu da
 *   consulta para sempre.
 * - **Claim otimista.** `status = 'publishing'` condicionado a `'scheduled'`.
 *   Até cinco ticks convivem; sem claim, dois publicam o mesmo post e a Meta
 *   aceita os dois.
 * - **Cap falha fechado.** Erro ao contar conta como cap estourado
 *   (`send-cap.ts`): banco instável não vira licença para publicar sem trava.
 * - **Uma publicação por conta por tick.** Ritmo, não vazão — o cap limita o
 *   volume, e o padrão é o que o filtro lê.
 * - **Travado volta em 10 minutos, não 5.** Vídeo processa por minutos, e o
 *   orçamento de espera de `publish.ts` é 120s: um tick vivo esperando a Meta
 *   nunca pode ser "destravado" por outro tick — seria o duplo envio de
 *   31/07 com post em vez de DM. `container_ids` fica intacto no requeue, e é
 *   por isso que voltar não recria nada.
 *
 * Nunca responde 503: quem chama embrulha em try/catch. O 503 do tick é
 * exclusivo do polling, o único aviso de que a ENTREGA parou.
 */

const STUCK_AFTER_MS = 10 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** Quantas linhas a consulta puxa. Uma por conta sai daqui; o resto espera o próximo tick. */
const BATCH = 20

export const MAX_ATTEMPTS = 5

/** Espera crescente entre tentativas, em minutos. A quinta desiste. */
const BACKOFF_MINUTES = [2, 5, 15, 30, 60]

export function retryDelayMs(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1
  return BACKOFF_MINUTES[index] * 60_000
}

export interface DrainResult {
  published: number
  deferred: number
  failed: number
  requeued: number
}

/**
 * `publishing` há mais de 10 minutos é tick que morreu no meio. Volta para a
 * fila com `container_ids` intacto — a próxima rodada retoma, não recria.
 * Quem já desistiu (`attempts` no teto) não volta sozinho.
 */
export async function requeueStuckPublications(now = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('publications')
    .update({ status: 'scheduled' })
    .eq('status', 'publishing')
    .lt('updated_at', new Date(now.getTime() - STUCK_AFTER_MS).toISOString())
    .lt('attempts', MAX_ATTEMPTS)
    .select('id')

  if (error) throw new Error(`requeue de publicações travadas falhou: ${error.message}`)
  return data?.length ?? 0
}

async function isUnderDailyCap(accountId: string, now: Date): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('publications')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'published')
    .gte('published_at', new Date(now.getTime() - DAY_MS).toISOString())

  // Falha fechado, como send-cap.ts: não conseguir contar não é permissão.
  if (error) return false
  return (count ?? 0) < env.PUBLISH_DAILY_CAP
}

/** A cota da própria Meta. Erro ao consultar adia — mesma regra do cap. */
async function hasMetaQuota(account: Account): Promise<boolean> {
  try {
    const quota = await fetchPublishingQuota({ igUserId: account.ig_user_id, accessToken: account.access_token })
    return quota.used < quota.total
  } catch (error) {
    console.error('[dm-flow] cota de publicação da Meta indisponível:', account.username, error)
    return false
  }
}

async function loadAccount(id: string): Promise<Account | null> {
  const { data } = await supabaseAdmin.from('accounts').select('*').eq('id', id).single()
  return (data as Account | null) ?? null
}

type Outcome = 'published' | 'deferred' | 'failed'

async function publishOne(row: Publication, account: Account, now: Date): Promise<Outcome> {
  const supabaseUrl = env.SUPABASE_URL

  try {
    const mediaUrls = row.media_paths.map((path) => publicationMediaUrl(path, supabaseUrl))
    if (mediaUrls.length === 0 || mediaUrls.some((url) => url === null)) {
      throw new PublishError('publicação sem mídia gravada', true)
    }

    const { platformMediaId } = await publishPublication({
      igUserId: account.ig_user_id,
      accessToken: account.access_token,
      kind: row.kind,
      caption: row.caption,
      mediaUrls: mediaUrls as string[],
      coverUrl: row.cover_path ? publicationMediaUrl(row.cover_path, supabaseUrl) : null,
      containerIds: row.container_ids as ContainerIds,
      // Gravar o container ANTES de seguir é a retomada inteira. Erro aqui
      // sobe e aborta: seguir sem anotar deixaria a janela em que o tick
      // morre com container criado e desconhecido.
      persist: async (ids) => {
        const { error } = await supabaseAdmin
          .from('publications')
          .update({ container_ids: ids, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        if (error) throw new Error(`não consegui gravar container_ids: ${error.message}`)
      },
    })

    const permalink = await fetchPermalink({ mediaId: platformMediaId, accessToken: account.access_token })

    const { error } = await supabaseAdmin
      .from('publications')
      .update({
        status: 'published',
        published_at: now.toISOString(),
        platform_media_id: platformMediaId,
        permalink,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    // O post está no ar e o banco não sabe. Retentar não pode: a próxima
    // rodada acharia o container como PUBLISHED e pararia com mensagem
    // pior. Permanente, com o id do post no erro para o dono conferir.
    if (error) {
      throw new PublishError(
        `publicado como ${platformMediaId}, mas não consegui gravar o resultado: ${error.message}`,
        true,
      )
    }

    return 'published'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const attempts = row.attempts + 1
    const desistiu = isPermanentPublishError(error) || attempts >= MAX_ATTEMPTS

    await supabaseAdmin
      .from('publications')
      .update(
        desistiu
          ? { status: 'failed', attempts, error: message, updated_at: new Date().toISOString() }
          : {
              status: 'scheduled',
              attempts,
              error: message,
              scheduled_at: new Date(now.getTime() + retryDelayMs(attempts)).toISOString(),
              updated_at: new Date().toISOString(),
            },
      )
      .eq('id', row.id)

    console.error('[dm-flow] publicação falhou:', row.id, desistiu ? '(desistiu)' : `(tentativa ${attempts})`, message)
    return desistiu ? 'failed' : 'deferred'
  }
}

export async function drainScheduledPublications(now = new Date()): Promise<DrainResult> {
  const requeued = await requeueStuckPublications(now)

  const { data, error } = await supabaseAdmin
    .from('publications')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(BATCH)

  if (error) throw new Error(`consulta de publicações agendadas falhou: ${error.message}`)

  // Uma por conta por rodada, na ordem de agendamento.
  const porConta = new Map<string, Publication>()
  for (const row of (data ?? []) as Publication[]) {
    if (!porConta.has(row.account_id)) porConta.set(row.account_id, row)
  }

  let published = 0
  let deferred = 0
  let failed = 0

  for (const row of porConta.values()) {
    const account = await loadAccount(row.account_id)
    if (!account || !account.is_active) {
      deferred += 1
      continue
    }
    // Tudo isto adia com `continue`, antes do claim e fora do try. Ver o
    // cabeçalho: cap dentro do try já sumiu com uma fila inteira.
    if (account.automations_paused || isQuiet(account, now)) {
      deferred += 1
      continue
    }
    if (!(await isUnderDailyCap(account.id, now))) {
      deferred += 1
      continue
    }
    if (!(await hasMetaQuota(account))) {
      deferred += 1
      continue
    }

    const { data: claimed } = await supabaseAdmin
      .from('publications')
      .update({ status: 'publishing', updated_at: now.toISOString() })
      .eq('id', row.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()

    if (!claimed) continue

    const outcome = await publishOne(row, account, now)
    if (outcome === 'published') published += 1
    else if (outcome === 'failed') failed += 1
    else deferred += 1
  }

  return { published, deferred, failed, requeued }
}
