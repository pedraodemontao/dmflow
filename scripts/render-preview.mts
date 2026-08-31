/**
 * Renderiza os três tipos de slide (capa, corpo, cta) com os textos MAIS
 * LONGOS que o schema permite, numa pasta local — sem servidor, sem banco.
 * É a prova visual da fase 2: o dono olha as imagens em `out/` e confirma que
 * cabe, sem corte, legível no celular.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/render-preview.mts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  SLIDE_BODY_MAX_CHARS,
  SLIDE_ITEM_MAX_CHARS,
  SLIDE_LIST_MAX_ITEMS,
  SLIDE_STAT_MAX_CHARS,
  SLIDE_TITLE_MAX_CHARS,
} from '../src/lib/ai/schemas'
import { renderSlide } from '../src/lib/render/render-slide'
import { TWEET_TEXT_MAX_CHARS, tweetElement } from '../src/lib/render/tweet-element'
import { slideElement, type Brand } from '../src/lib/render/slide-element'
import type { CarouselSlide } from '../src/lib/ai/schemas'

const OUT_DIR = join(process.cwd(), 'out')

/** Handle propositalmente longo — é o pior caso pro cabeçalho da capa. */
const brand: Brand = { handle: 'perfil.de.exemplo.longo', ctaKeyword: 'COMPARTILHAMENTO' }

/** Preenche até EXATAMENTE o teto — é o pior caso que o schema deixa passar. */
function toMaxLength(max: number): string {
  const filler = 'texto de exemplo pra ver se cabe sem cortar nada no slide aqui '
  let text = ''
  while (text.length < max) text += filler
  return text.slice(0, max).trimEnd()
}

const slides: CarouselSlide[] = [
  { kind: 'cover', layout: 'texto', title: toMaxLength(SLIDE_TITLE_MAX_CHARS) },
  { kind: 'body', layout: 'texto', title: toMaxLength(SLIDE_TITLE_MAX_CHARS), body: toMaxLength(SLIDE_BODY_MAX_CHARS) },
  {
    kind: 'body',
    layout: 'lista',
    title: toMaxLength(SLIDE_TITLE_MAX_CHARS),
    items: Array.from({ length: SLIDE_LIST_MAX_ITEMS }, () => toMaxLength(SLIDE_ITEM_MAX_CHARS)),
  },
  { kind: 'body', layout: 'numero', title: toMaxLength(SLIDE_STAT_MAX_CHARS), body: toMaxLength(SLIDE_BODY_MAX_CHARS) },
  { kind: 'body', layout: 'frase', title: toMaxLength(SLIDE_TITLE_MAX_CHARS) },
  { kind: 'cta', layout: 'texto', title: toMaxLength(SLIDE_TITLE_MAX_CHARS), body: toMaxLength(SLIDE_BODY_MAX_CHARS) },
]

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // Capa com arte: um fundo de mentira gerado na hora (sharp), porque o preview
  // não depende de rede nem de imagem versionada no repo.
  const { default: sharp } = await import('sharp')
  const fundo = await sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 30, g: 80, b: 110 } },
  })
    .jpeg()
    .toBuffer()
  const comArte: Brand = { ...brand, coverBackgroundDataUri: `data:image/jpeg;base64,${fundo.toString('base64')}` }
  const tweet = tweetElement({ name: 'Perfil De Exemplo Longo', handle: 'perfil.de.exemplo.longo', text: toMaxLength(TWEET_TEXT_MAX_CHARS) })
  await writeFile(join(OUT_DIR, '0-padrao-tweet.jpg'), await renderSlide(tweet))
  console.log(`[render-preview] ${join(OUT_DIR, '0-padrao-tweet.jpg')}`)

  const capaArte = slideElement({ kind: 'cover', layout: 'texto', title: toMaxLength(SLIDE_TITLE_MAX_CHARS) }, 0, 6, comArte)
  await writeFile(join(OUT_DIR, '0-cover-arte.jpg'), await renderSlide(capaArte))
  console.log(`[render-preview] ${join(OUT_DIR, '0-cover-arte.jpg')}`)

  for (const [index, slide] of slides.entries()) {
    const element = slideElement(slide, index, slides.length, brand)
    const buffer = await renderSlide(element)
    const path = join(OUT_DIR, `${index + 1}-${slide.kind}-${slide.layout}.jpg`)
    await writeFile(path, buffer)
    console.log(`[render-preview] ${path} (${buffer.byteLength} bytes)`)
  }
}

main().catch((error) => {
  console.error('[render-preview] falhou:', error)
  process.exitCode = 1
})
