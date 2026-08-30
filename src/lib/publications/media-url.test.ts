import { describe, expect, it } from 'vitest'

import { PUBLICATION_MEDIA_BUCKET, publicationMediaUrl } from '@/lib/publications/media-url'

describe('publicationMediaUrl', () => {
  it('monta a URL pública do bucket a partir do caminho', () => {
    expect(publicationMediaUrl('carousel/abc/1/0.jpg', 'https://proj.supabase.co')).toBe(
      `https://proj.supabase.co/storage/v1/object/public/${PUBLICATION_MEDIA_BUCKET}/carousel/abc/1/0.jpg`,
    )
  })

  it('não leva ?download: quem abre é a Meta, não um navegador', () => {
    expect(publicationMediaUrl('a.jpg', 'https://proj.supabase.co')).not.toContain('?download')
  })

  it('sem supabaseUrl devolve null em vez de undefined/storage/...', () => {
    expect(publicationMediaUrl('a.jpg', undefined)).toBeNull()
  })
})
