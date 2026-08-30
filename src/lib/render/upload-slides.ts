import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Sobe os slides já renderizados (JPEG) pro bucket público `publication-media`
 * (card 04, fase 1 — bucket é item do dono, não desta fase). Devolve
 * CAMINHOS, nunca URL: quem monta a URL é uma função própria
 * (`publicationMediaUrl`, card 04), mesma regra de `deliveryFileUrl`.
 */

const BUCKET = 'publication-media'

/**
 * `version` existe por causa de CACHE: a URL pública do Supabase passa por
 * CDN, e regerar no MESMO caminho pode servir à Meta a imagem velha por até
 * uma hora — mesmo com `upsert: true` trocando o arquivo no storage. Caminho
 * novo a cada render, sempre; quem chama decide o valor (timestamp, uuid).
 */
export function slidePath(scriptId: string, version: string, index: number): string {
  return `carousel/${scriptId}/${version}/${index + 1}.jpg`
}

/**
 * Sobe todos os slides de um carrossel. Erro de QUALQUER upload SOBE — não
 * vai para um array de erros que ninguém lê (mesmo princípio do `enqueue()`
 * no webhook: retorno de storage se ignora por acidente, exceção não).
 * Publicar um carrossel com um slide faltando é pior que falhar a geração
 * inteira e o dono tentar de novo.
 */
export async function uploadSlides(
  scriptId: string,
  version: string,
  buffers: Buffer[],
): Promise<string[]> {
  const paths = buffers.map((_, index) => slidePath(scriptId, version, index))

  await Promise.all(
    buffers.map(async (buffer, index) => {
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(paths[index], buffer, { contentType: 'image/jpeg', upsert: true })

      if (error) throw error
    }),
  )

  return paths
}
