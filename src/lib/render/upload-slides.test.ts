import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * A trava do upload: caminho com `version` (contra a URL do Supabase servindo
 * a imagem velha por até uma hora — o CDN cacheia por caminho), `contentType`
 * certo, e erro que SOBE — não vai para um array que ninguém lê (mesmo
 * princípio do `enqueue()` no webhook).
 */

type UploadCall = { bucket: string; path: string; contentType: string }

let uploadCalls: UploadCall[] = []
let forceError: string | null = null

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _buffer: Buffer, options: { contentType: string }) => {
          if (forceError) return { data: null, error: { message: forceError } }
          uploadCalls.push({ bucket, path, contentType: options.contentType })
          return { data: { path }, error: null }
        },
      }),
    },
  },
}))

const { slidePath, uploadSlides } = await import('@/lib/render/upload-slides')

afterEach(() => {
  uploadCalls = []
  forceError = null
})

describe('slidePath', () => {
  it('inclui a version no caminho — regerar não pode reusar o caminho antigo', () => {
    expect(slidePath('script-1', 'v1', 0)).toBe('carousel/script-1/v1/1.jpg')
    expect(slidePath('script-1', 'v2', 0)).not.toBe(slidePath('script-1', 'v1', 0))
  })

  it('slide é 1-indexado no caminho (n do carrossel, não índice de array)', () => {
    expect(slidePath('script-1', 'v1', 4)).toBe('carousel/script-1/v1/5.jpg')
  })
})

describe('uploadSlides', () => {
  it('sobe cada slide com contentType image/jpeg e caminho com a version', async () => {
    const paths = await uploadSlides('script-1', 'v1', [Buffer.from('a'), Buffer.from('b')])

    expect(paths).toEqual(['carousel/script-1/v1/1.jpg', 'carousel/script-1/v1/2.jpg'])
    expect(uploadCalls).toHaveLength(2)
    expect(uploadCalls.every((call) => call.contentType === 'image/jpeg')).toBe(true)
    expect(uploadCalls.every((call) => call.bucket === 'publication-media')).toBe(true)
  })

  it('erro do storage SOBE — não vira array de erro que ninguém lê', async () => {
    forceError = 'bucket fora do ar'

    await expect(uploadSlides('script-1', 'v1', [Buffer.from('a')])).rejects.toMatchObject({
      message: 'bucket fora do ar',
    })
  })
})
