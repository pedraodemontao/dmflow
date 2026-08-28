/**
 * O anexo da entrega — o arquivo que a página pública oferece para baixar.
 *
 * Bucket PÚBLICO, pelo mesmo motivo de `library-thumbs`: entrega é material de
 * marketing feito para ser distribuído, e a página que o oferece já é pública
 * (ver a entrada `/e` em `src/proxy.ts`). URL assinada aqui só criaria link que
 * expira no meio de uma DM já enviada.
 *
 * O bloco guarda o CAMINHO, nunca a URL. Quem monta a URL é esta função. Bloco
 * com URL livre seria phishing servido do domínio da própria conta — é a mesma
 * razão de a migration 0016 exigir blocos tipados em vez de HTML.
 */
export const DELIVERY_FILES_BUCKET = 'delivery-files'

/**
 * `?download` faz o Supabase mandar `Content-Disposition: attachment`. Sem ele
 * o PDF abre numa aba em vez de baixar: o atributo `download` do `<a>` é
 * ignorado quando o arquivo mora noutra origem, e o storage é outra origem.
 *
 * Devolve `null` sem `supabaseUrl` — a página então mostra o nome do arquivo
 * sem link, em vez de um botão que leva a `undefined/storage/...`.
 */
export function deliveryFileUrl(path: string, supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null
  return `${supabaseUrl}/storage/v1/object/public/${DELIVERY_FILES_BUCKET}/${path}?download`
}
