import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildCaptionPrompt, generateCaption, mockCaption } from '@/lib/ai/generate-caption'
import type { Persona } from '@/types/db'

const persona = {
  id: 'p1',
  account_id: 'acc-1',
  name: 'Ju',
  niche: 'confeitaria',
  voice_prompt: 'voz',
  forbidden_rules: [],
  format_rules: '',
  named_mechanisms: [],
  recording_guidance: '',
  headline_formula: '',
  offer: '',
  cta_keyword: 'DOCE',
  is_active: true,
  created_at: '',
  updated_at: '',
} as unknown as Persona

function input(over: Record<string, unknown> = {}) {
  return { persona, kind: 'image' as const, draft: null, ...over }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('buildCaptionPrompt', () => {
  it('fala da imagem quando ela existe, e avisa quando não', () => {
    expect(buildCaptionPrompt(input({ image: { mediaType: 'image/jpeg', base64: 'x' } }))).toContain('está acima')
    expect(buildCaptionPrompt(input())).toContain('sem imagem disponível')
  })

  it('aproveita o rascunho do dono como direção', () => {
    expect(buildCaptionPrompt(input({ draft: 'hoje é sobre brigadeiro' }))).toContain('hoje é sobre brigadeiro')
  })

  it('leva a palavra-chave e a regra do gancho na primeira linha', () => {
    const prompt = buildCaptionPrompt(input())
    expect(prompt).toContain('DOCE')
    expect(prompt).toContain('PRIMEIRA linha é o gancho')
  })
})

describe('generateCaption', () => {
  it('sem chave cai no mock, com o motivo declarado', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const result = await generateCaption(input())

    expect(result.mock).toBe(true)
    expect(result.fallbackReason).toContain('ANTHROPIC_API_KEY')
    expect(result.caption).toContain('DOCE')
  })

  it('erro do provedor cai no mock com o detalhe', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"type":"error"}', { status: 500 })))

    const result = await generateCaption(input())

    expect(result.mock).toBe(true)
    expect(result.fallbackReason).toContain('500')
  })
})

describe('mockCaption', () => {
  it('é determinístico e usa o rascunho quando há', () => {
    expect(mockCaption(input())).toBe(mockCaption(input()))
    expect(mockCaption(input({ draft: 'meu rascunho' }))).toContain('meu rascunho')
  })
})
