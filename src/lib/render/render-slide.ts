import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactElement } from 'react'

import { ImageResponse } from 'next/og'
import sharp from 'sharp'

import { FONT_FAMILY, SLIDE_HEIGHT, SLIDE_WIDTH } from '@/lib/render/slide-element'

/**
 * `ReactElement` (de `slideElement`) → JPEG pronto pro bucket.
 *
 * `next/og` (satori) só lê `ttf`/`otf`/`woff` — nunca a fonte VARIÁVEL (ver
 * `fonts/LICENSE.md`: satori faz o parsing de `fvar` mas não implementa
 * `gvar`, a tabela que interpola o glifo entre eixos; embutir a variável
 * renderizaria sempre na instância padrão, peso e largura errados, sem erro
 * nenhum). Por isso os três arquivos em `fonts/` já são instâncias ESTÁTICAS.
 *
 * `fs.readFile`, não `import` — `import` colocaria o TTF no bundle do Next
 * (JS), e aqui ele precisa ser bytes crus pro satori. Lido uma vez por
 * processo: a Vercel recicla a função entre invocações, então o cache
 * sobrevive a mais de um render sem reabrir os três arquivos toda vez.
 *
 * Runtime NODE, nunca edge — quem importa este módulo numa rota decide isso
 * na própria rota (`export const runtime`), mas o motivo mora aqui: `sharp`
 * é binário nativo, e edge não roda binário nativo.
 */

const FONTS_DIR = join(process.cwd(), 'src/lib/render/fonts')

/** Qualidade do JPEG final — 90 é o mesmo número que `library/thumbs.ts` usa pra cópia de capa. */
const JPEG_QUALITY = 90

type LoadedFont = {
  name: string
  data: ArrayBuffer
  weight: 400 | 500 | 700
  style: 'normal'
}

let fontsPromise: Promise<LoadedFont[]> | null = null

/**
 * `Buffer.buffer` sozinho é armadilha: `fs.readFile` costuma devolver um
 * `Buffer` fatiado de um POOL maior (`Buffer.poolSize`), então `.buffer` é o
 * ArrayBuffer do pool INTEIRO, não só os bytes do arquivo — sem `slice` pelo
 * `byteOffset`/`byteLength`, o satori carregaria o TTF com lixo de outro
 * arquivo colado antes ou depois, ou o offset errado. `Buffer.from` acima
 * conserta isso de graça, mas aqui não passa por ele — então o `slice` é a
 * cerca.
 */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

function loadFonts(): Promise<LoadedFont[]> {
  fontsPromise ??= (async () => {
    const [title, body, label] = await Promise.all([
      readFile(join(FONTS_DIR, 'archivo-semiexpanded-bold.ttf')),
      readFile(join(FONTS_DIR, 'ibm-plex-sans-regular.ttf')),
      readFile(join(FONTS_DIR, 'ibm-plex-mono-medium.ttf')),
    ])

    return [
      { name: FONT_FAMILY.title, data: toArrayBuffer(title), weight: 700, style: 'normal' },
      { name: FONT_FAMILY.body, data: toArrayBuffer(body), weight: 400, style: 'normal' },
      { name: FONT_FAMILY.label, data: toArrayBuffer(label), weight: 500, style: 'normal' },
    ]
  })()

  return fontsPromise
}

export async function renderSlide(element: ReactElement): Promise<Buffer> {
  const fonts = await loadFonts()

  const image = new ImageResponse(element, { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, fonts })
  const png = Buffer.from(await image.arrayBuffer())

  return sharp(png).jpeg({ quality: JPEG_QUALITY }).toBuffer()
}
