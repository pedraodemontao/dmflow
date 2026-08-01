import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Guardar a capa em vez de linkar a do Instagram.
 *
 * Diagnóstico de 01/08/2026, com o log de rede na mão: as dez miniaturas
 * carregavam do servidor uma a uma, e no navegador OITO DAS DEZ voltavam 503.
 * A diferença não era referrer nem formato de URL — era rajada. O navegador
 * pede as dez capas ao mesmo tempo ao CDN do Instagram, e ele derruba a
 * maioria por limite de taxa. Some a isso que a URL assinada expira em
 * horas ou dias, e a conclusão é uma só: **hotlink de CDN do Instagram não é
 * base para uma tela que precisa funcionar.**
 *
 * Então baixamos a imagem na raspagem e servimos a nossa cópia. É o mesmo
 * caminho que o projeto de origem tomou (`scripts/download-thumbs.mjs`), e o
 * fato de eles terem escrito aquele script é a prova de que bateram no mesmo
 * muro.
 *
 * O bucket é público de propósito: é capa de post público, não há segredo
 * nenhum ali, e URL assinada nos traria de volta o problema da expiração.
 */

const BUCKET = 'library-thumbs'

/** Teto por imagem. Capa de reel não passa disso; acima é coisa errada. */
const MAX_BYTES = 3 * 1024 * 1024

/**
 * Uma de cada vez, com pausa. É a lição do 503: o Instagram derruba rajada.
 * Baixar é trabalho de fundo — melhor lento e completo que rápido e furado.
 */
const GAP_MS = 250

export interface ThumbResult {
  itemId: string
  ok: boolean
  reason?: string
}

function pathFor(itemId: string): string {
  return `${itemId}.jpg`
}

export function publicThumbUrl(supabaseUrl: string, itemId: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${pathFor(itemId)}`
}

/**
 * Baixa e guarda uma capa. Devolve a URL nossa, ou `null` quando não deu — e
 * não dar não é erro fatal: o card cai na placa com o monograma do autor, que
 * já existe justamente para isto.
 */
export async function storeThumb(args: {
  itemId: string
  sourceUrl: string
  supabaseUrl: string
}): Promise<string | null> {
  try {
    const response = await fetch(args.sourceUrl, {
      // Sem referrer: é o que o CDN do Instagram espera de quem não é ele.
      referrerPolicy: 'no-referrer',
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) return null

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(pathFor(args.itemId), buffer, {
        contentType: response.headers.get('content-type') ?? 'image/jpeg',
        // Sobrescreve: raspagem repetida do mesmo post traz a mesma capa, e
        // guardar duas cópias só ocuparia espaço.
        upsert: true,
      })

    if (error) {
      console.error('[biblioteca] capa não subiu:', args.itemId, error.message)
      return null
    }

    return publicThumbUrl(args.supabaseUrl, args.itemId)
  } catch (error) {
    console.error('[biblioteca] capa não baixou:', args.itemId, String(error))
    return null
  }
}

/**
 * Guarda as capas que ainda apontam para o Instagram.
 *
 * Roda depois da gravação, nunca antes: a raspagem já foi paga e não pode
 * ficar refém do download de imagem. Se cair no meio, o que baixou fica e o
 * resto volta na próxima — a consulta só pega quem ainda não tem cópia nossa.
 */
export async function backfillThumbs(args: {
  accountId: string
  supabaseUrl: string
  limit?: number
}): Promise<ThumbResult[]> {
  const { data } = await supabaseAdmin
    .from('library_items')
    .select('id, thumb_url')
    .eq('account_id', args.accountId)
    .not('thumb_url', 'is', null)
    .limit(args.limit ?? 200)

  // O filtro fica aqui e não na query: a Meta serve as capas por DOIS domínios
  // (`cdninstagram.com` e `fbcdn.net`) e um `like` com um só deixaria metade
  // de fora — foi o erro da primeira versão desta função. Filtrar pelo que É
  // nosso é mais seguro que tentar listar o que é deles.
  const rows = ((data ?? []) as Array<{ id: string; thumb_url: string }>)
    .filter((row) => !row.thumb_url.includes('/storage/v1/object/public/'))
    .slice(0, args.limit ?? 40)
  const results: ThumbResult[] = []

  for (const row of rows) {
    const url = await storeThumb({
      itemId: row.id,
      sourceUrl: row.thumb_url,
      supabaseUrl: args.supabaseUrl,
    })

    if (url) {
      await supabaseAdmin.from('library_items').update({ thumb_url: url }).eq('id', row.id)
      results.push({ itemId: row.id, ok: true })
    } else {
      results.push({ itemId: row.id, ok: false, reason: 'download ou upload falhou' })
    }

    await new Promise((resolve) => setTimeout(resolve, GAP_MS))
  }

  return results
}
