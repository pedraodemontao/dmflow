import { env } from '@/lib/env'
import type { Carousel } from '@/lib/ai/schemas'
import { publicationMediaUrl } from '@/lib/publications/media-url'
import { renderSlide } from '@/lib/render/render-slide'
import { slideElement, type Brand } from '@/lib/render/slide-element'
import { uploadSlides } from '@/lib/render/upload-slides'

/**
 * Carrossel em texto → JPEGs no bucket → URLs para a prévia e caminhos para
 * `publications.media_paths`.
 *
 * Sequencial de propósito: o satori é CPU e cada slide leva por volta de um
 * segundo; dez em paralelo numa função da Vercel só disputam o mesmo núcleo.
 */

export interface RenderedCarousel {
  version: string
  paths: string[]
  urls: string[]
}

/** Caminho novo a cada render — a URL pública passa por CDN (ver `upload-slides.ts`). */
export function newVersion(now = Date.now()): string {
  return now.toString(36)
}

export async function renderAndUploadCarousel(args: {
  /** Pasta no bucket. O id do roteiro quando ele foi gravado; um uuid quando não. */
  renderKey: string
  carousel: Carousel
  brand: Brand
  version?: string
}): Promise<RenderedCarousel> {
  const version = args.version ?? newVersion()
  const total = args.carousel.slides.length

  const buffers: Buffer[] = []
  for (const [index, slide] of args.carousel.slides.entries()) {
    buffers.push(await renderSlide(slideElement(slide, index, total, args.brand)))
  }

  const paths = await uploadSlides(args.renderKey, version, buffers)
  const supabaseUrl = env.SUPABASE_URL
  const urls = paths.map((path) => publicationMediaUrl(path, supabaseUrl) as string)

  return { version, paths, urls }
}
