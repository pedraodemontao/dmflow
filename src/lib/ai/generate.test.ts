import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MOCK_MODEL,
  buildUserPrompt,
  generateScript,
  mockScript,
  type GenerateScriptInput,
} from '@/lib/ai/generate'
import { scriptSchema } from '@/lib/ai/schemas'
import type { FunnelStage, LibraryItem, Persona } from '@/types/db'

/**
 * O mock é caminho de produção, não enfeite de teste: é ele que faz a tela
 * funcionar sem chave e o que permite exercitar a rota inteira sem gastar
 * crédito. Se ele parar de bater no schema, a gravação quebra exatamente na
 * máquina onde não há chave para depurar.
 *
 * Nenhum caso aqui toca a rede — `ANTHROPIC_API_KEY` é apagada de propósito.
 */

const persona: Persona = {
  id: 'p1',
  account_id: 'a1',
  name: 'Dona Vera',
  niche: 'confeitaria caseira',
  voice_prompt: 'Fala como quem ensina na cozinha.',
  forbidden_rules: [],
  format_rules: 'Abrir mostrando o doce pronto.',
  named_mechanisms: [],
  recording_guidance: 'Bancada iluminada.',
  headline_formula: 'Como X sem Y',
  offer: '',
  cta_keyword: 'DOCE',
  is_active: true,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
}

function stage(key: FunnelStage['key']): FunnelStage {
  return {
    id: `s-${key}`,
    account_id: 'a1',
    persona_id: 'p1',
    key,
    label: key,
    cta_instruction: `CTA de ${key}`,
    sort_order: 0,
    created_at: '2026-07-01T00:00:00Z',
  }
}

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'i1',
    account_id: 'a1',
    persona_id: null,
    profile_id: null,
    source: 'instagram',
    owner_handle: 'docesdaju',
    category: 'receita',
    post_type: 'reel',
    external_url: 'https://instagram.com/reel/1',
    thumb_url: null,
    views: 4719,
    plays: 112806,
    likes: 900,
    comments: 40,
    duration_sec: 42,
    caption: 'o ponto do brigadeiro que ninguém acerta',
    posted_at: null,
    visual_format: 'talking_head + screencast',
    format_desc: null,
    hook_text: 'seu brigadeiro desanda por causa disso',
    structure: 'gancho > erro comum > demonstração > prova',
    engagement: 0.0083,
    outlier: 3.4,
    watched: false,
    scraped_at: null,
    top_comments: [],
    hashtags: [],
    is_paid_partnership: false,
    aspect_ratio: null,
    analyzed_at: null,
    analysis_model: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function input(overrides: Partial<GenerateScriptInput> = {}): GenerateScriptInput {
  return {
    persona,
    stage: stage('meio'),
    pillar: 'receita',
    theme: 'ponto do brigadeiro',
    duration: '60-120',
    refs: [item()],
    modeledOn: item(),
    hookPatterns: null,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('mockScript', () => {
  it('produz um roteiro que passa no mesmo schema da IA', () => {
    expect(scriptSchema.safeParse(mockScript(input())).success).toBe(true)
  })

  it('é determinístico: mesma entrada, mesmo roteiro', () => {
    expect(mockScript(input())).toEqual(mockScript(input()))
  })

  it('sai da persona, não de um nicho escrito no código', () => {
    const roteiro = mockScript(input())
    const outroNicho = mockScript(
      input({ persona: { ...persona, niche: 'marcenaria', cta_keyword: 'SERRA' } }),
    )

    expect(JSON.stringify(roteiro)).toContain('confeitaria caseira')
    expect(JSON.stringify(outroNicho)).toContain('marcenaria')
    expect(JSON.stringify(outroNicho)).not.toContain('confeitaria')
    expect(outroNicho.ctas.instagram.tela).toBe('Comenta SERRA')
  })

  it('muda o fecho conforme a etapa do funil', () => {
    const topo = mockScript(input({ stage: stage('topo') }))
    const fundo = mockScript(input({ stage: stage('fundo') }))

    expect(topo.beats.at(-1)?.fala).not.toContain('DOCE')
    expect(fundo.beats.at(-1)?.fala).toContain('DOCE')
  })

  it('cai no pilar quando não há tema', () => {
    expect(mockScript(input({ theme: null })).headline).toContain('receita')
  })
})

describe('buildUserPrompt', () => {
  it('manda o vídeo-molde inteiro quando há molde', () => {
    const prompt = buildUserPrompt(input())

    expect(prompt).toContain('MODELADO')
    expect(prompt).toContain('@docesdaju')
    expect(prompt).toContain('112806 plays')
    expect(prompt).toContain('3.4× a mediana')
    expect(prompt).toContain('gancho > erro comum > demonstração > prova')
    expect(prompt).toContain('CTA de meio')
  })

  it('cai para o grounding da biblioteca quando não há molde', () => {
    const prompt = buildUserPrompt(input({ modeledOn: null }))

    expect(prompt).not.toContain('MODELADO')
    expect(prompt).toContain('CONTEÚDOS REAIS DO NICHO')
    expect(prompt).toContain('@docesdaju')
  })

  it('avisa que a biblioteca está vazia em vez de mandar uma lista em branco', () => {
    const prompt = buildUserPrompt(input({ modeledOn: null, refs: [] }))

    expect(prompt).toContain('(biblioteca ainda vazia)')
  })

  it('leva a palavra-chave do CTA', () => {
    expect(buildUserPrompt(input())).toContain('"DOCE"')
  })
})

describe('generateScript', () => {
  it('usa o mock e marca o modelo quando não há chave', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const gerado = await generateScript(input())

    expect(gerado.model).toBe(MOCK_MODEL)
    expect(gerado.output).toEqual(mockScript(input()))
  })

  it('não inventa contagem de token no caminho do mock', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const gerado = await generateScript(input())

    // Gravar 0 fingiria que houve uma chamada de graça.
    expect(gerado.tokensIn).toBeNull()
    expect(gerado.tokensOut).toBeNull()
  })
})
