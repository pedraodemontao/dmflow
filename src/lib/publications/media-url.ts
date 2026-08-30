/**
 * A mídia da publicação — o que a Meta baixa para montar o post.
 *
 * Bucket PÚBLICO, pelo mesmo motivo de `delivery-files` e `library-thumbs`: a
 * Meta busca `image_url`/`video_url` sem credencial nenhuma, e o conteúdo é
 * material feito para ser publicado. URL assinada expiraria no meio de um
 * container ainda processando.
 *
 * `publications.media_paths` guarda o CAMINHO, nunca a URL. Quem monta a URL
 * é esta função — a mesma regra de `deliveryFileUrl`, e pelo mesmo motivo:
 * URL livre no banco é phishing servido do nosso domínio esperando acontecer.
 */
export const PUBLICATION_MEDIA_BUCKET = 'publication-media'

/**
 * Sem `?download`: aqui quem abre é a Meta, e `Content-Disposition:
 * attachment` faria o CDN dela tratar a imagem como arquivo, não como mídia.
 *
 * Devolve `null` sem `supabaseUrl` — a drenagem então falha com mensagem
 * clara em vez de mandar `undefined/storage/...` para a Meta recusar.
 */
export function publicationMediaUrl(path: string, supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null
  return `${supabaseUrl}/storage/v1/object/public/${PUBLICATION_MEDIA_BUCKET}/${path}`
}
