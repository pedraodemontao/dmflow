import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildCarouselClonePrompt,
  buildStaticClonePrompt,
  cloneCarouselFromImages,
  clonedTextSchema,
} from '@/lib/ai/clone-content'
import type { Persona } from '@/types/db'

const persona = {
  id: 'p1',
  name: 'Ju',
  niche: 'confeitaria',
  cta_keyword: 'DOCE',
  forbidden_rules: [],
  named_mechanisms: [],
  voice_prompt: 'voz',
  format_rules: '',
  recording_guidance: '',
  headline_formula: '',
  offer: '',
} as unknown as Persona

afterEach(() => vi.unstubAllEnvs())

describe('buildCarouselClonePrompt', () => {
  it('copiar mantém o texto; modelar reescreve tudo na voz da persona', () => {
    const copiar = buildCarouselClonePrompt(persona, 'copiar', 5)
    expect(copiar).toContain('TEXTO COMO ESTÁ')
    expect(copiar).not.toContain('reescreva 100%')

    const modelar = buildCarouselClonePrompt(persona, 'modelar', 5)
    expect(modelar).toContain('reescreva 100%')
    expect(modelar).toContain('confeitaria')
  })

  it('diz quantos prints são e a regra dos layouts', () => {
    const prompt = buildCarouselClonePrompt(persona, 'modelar', 7)
    expect(prompt).toContain('7 imagens')
    expect(prompt).toContain('"lista"')
  })
})

describe('buildStaticClonePrompt', () => {
  it('nunca traz autor, handle ou métrica do print', () => {
    expect(buildStaticClonePrompt(persona, 'copiar')).toContain('sem métricas')
    expect(buildStaticClonePrompt(persona, 'modelar')).toContain('sem métricas')
  })
})

describe('cloneCarouselFromImages', () => {
  it('sem chave devolve erro claro — clonagem não tem mock', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const result = await cloneCarouselFromImages({
      persona,
      mode: 'modelar',
      images: [{ mediaType: 'image/png', base64: 'QUJD' }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('ANTHROPIC_API_KEY')
  })
})

describe('clonedTextSchema', () => {
  it('respeita o teto do card', () => {
    expect(clonedTextSchema.safeParse({ text: 'ok' }).success).toBe(true)
    expect(clonedTextSchema.safeParse({ text: 'x'.repeat(600) }).success).toBe(false)
  })
})
