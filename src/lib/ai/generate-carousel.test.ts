import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GenerateCarouselInput } from '@/lib/ai/generate-carousel'
import { carouselSchema, type Script } from '@/lib/ai/schemas'
import type { LibraryItem, Persona } from '@/types/db'

/**
 * O mock é caminho de produção, não enfeite de teste — mesma regra de
 * `generate.test.ts`. Nenhum caso aqui toca a rede.
 *
 * Supabase é simulado com um array em memória (mesmo espírito de
 * `engine-blocks.test.ts`): o que importa aqui é que `generateCarousel` grava
 * `kind = 'carousel'` e devolve o resultado MESMO quando a gravação falha.
 */

type Row = Record<string, unknown>

let scripts: Row[] = []
let forceInsertError: string | null = null

function fakeQuery(table: string) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder

  builder.select = chain
  builder.eq = chain

  builder.insert = (payload: Row) => {
    const afterInsert: Record<string, unknown> = { ...builder }
    afterInsert.select = () => afterInsert
    afterInsert.single = async () => {
      if (table !== 'scripts') return { data: null, error: null }
      if (forceInsertError) return { data: null, error: { message: forceInsertError } }

      const row = { id: `script-${scripts.length + 1}`, ...payload }
      scripts.push(row)
      return { data: row, error: null }
    }
    return afterInsert
  }

  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => fakeQuery(table) },
}))

const { MOCK_MODEL } = await import('@/lib/ai/generate')
const { MOCK_BODY_SLIDES, buildCarouselUserPrompt, generateCarousel, mockCarousel } =
  await import('@/lib/ai/generate-carousel')

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

function take(marca: string) {
  return { tela: `tela ${marca}`, fala: `fala ${marca}` }
}

function roteiro(): Script {
  return {
    headline: 'Como fazer brigadeiro sem errar o ponto',
    hooks: [take('1'), take('2'), take('3')],
    beats: [
      { beat: 'Gancho (0-3s)', ...take('g') },
      { beat: 'Problema (4-15s)', ...take('p') },
      { beat: 'Demonstração (16-45s)', ...take('d') },
      { beat: 'CTA', ...take('c') },
    ],
    caption: 'legenda longa do roteiro #doces',
    ctas: { tiktok: take('tt'), instagram: take('ig') },
    format: { tipo: 'talking head', dica: 'bancada iluminada' },
  }
}

function input(overrides: Partial<GenerateCarouselInput> = {}): GenerateCarouselInput {
  return {
    accountId: 'a1',
    persona,
    pillarId: null,
    pillar: 'receitas',
    theme: 'ponto do brigadeiro',
    refs: [item()],
    modeledOn: null,
    fromScript: null,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  scripts = []
  forceInsertError = null
})

describe('mockCarousel', () => {
  it('produz um carrossel que passa no mesmo schema da IA', () => {
    expect(carouselSchema.safeParse(mockCarousel(input())).success).toBe(true)
  })

  it('é determinístico: mesma entrada, mesmo carrossel', () => {
    expect(mockCarousel(input())).toEqual(mockCarousel(input()))
  })

  it('sai da persona, não de um nicho escrito no código', () => {
    const carrossel = mockCarousel(input())
    const outroNicho = mockCarousel(
      input({ persona: { ...persona, niche: 'marcenaria', cta_keyword: 'SERRA' } }),
    )

    expect(JSON.stringify(carrossel)).toContain('confeitaria')
    expect(JSON.stringify(outroNicho)).toContain('marcenaria')
    expect(outroNicho.slides.at(-1)?.title).toContain('SERRA')
  })

  it('preserva a headline do roteiro-origem no caminho fromScript', () => {
    const carrossel = mockCarousel(input({ fromScript: roteiro() }))

    expect(carrossel.slides[0].title).toBe(roteiro().headline)
  })

  it(`usa os beats do roteiro-origem nos ${MOCK_BODY_SLIDES} slides do meio`, () => {
    const carrossel = mockCarousel(input({ fromScript: roteiro() }))
    const meio = carrossel.slides.slice(1, -1)

    expect(meio).toHaveLength(MOCK_BODY_SLIDES)
    expect(meio[0].title).toBe('tela g')
    expect(meio[0].body).toBe('fala g')
  })
})

describe('buildCarouselUserPrompt', () => {
  it('leva a palavra-chave do CTA', () => {
    expect(buildCarouselUserPrompt(input())).toContain('"DOCE"')
  })

  it('avisa que é UM gancho só, não teste A/B', () => {
    expect(buildCarouselUserPrompt(input())).toContain('carrossel não tem teste A/B de gancho')
  })

  it('manda o vídeo-molde quando há modeledOn', () => {
    const prompt = buildCarouselUserPrompt(input({ modeledOn: item() }))

    expect(prompt).toContain('MODELADO')
    expect(prompt).toContain('@docesdaju')
  })

  it('cai para o grounding da biblioteca sem molde nem roteiro-origem', () => {
    const prompt = buildCarouselUserPrompt(input())

    expect(prompt).not.toContain('MODELADO')
    expect(prompt).toContain('CONTEÚDOS REAIS DO NICHO')
  })

  it('prioriza fromScript sobre modeledOn quando os dois vêm preenchidos', () => {
    const prompt = buildCarouselUserPrompt(input({ modeledOn: item(), fromScript: roteiro() }))

    expect(prompt).toContain('ROTEIRO ORIGINAL')
    expect(prompt).toContain(roteiro().headline)
    expect(prompt).not.toContain('MODELADO')
  })

  it('manda headline, beats e legenda do roteiro-origem, e pede manter a promessa', () => {
    const prompt = buildCarouselUserPrompt(input({ fromScript: roteiro() }))

    expect(prompt).toContain(roteiro().headline)
    expect(prompt).toContain('tela g — fala g')
    expect(prompt).toContain('legenda longa do roteiro')
    expect(prompt).toContain('MESMA promessa')
  })
})

describe('generateCarousel', () => {
  it('usa o mock e marca o modelo quando não há chave', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const gerado = await generateCarousel(input())

    expect(gerado.model).toBe(MOCK_MODEL)
    expect(gerado.output).toEqual(mockCarousel(input()))
  })

  it('não inventa contagem de token no caminho do mock', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const gerado = await generateCarousel(input())

    expect(gerado.tokensIn).toBeNull()
    expect(gerado.tokensOut).toBeNull()
  })

  it('grava em scripts com kind carousel', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const gerado = await generateCarousel(input())

    expect(gerado.script).not.toBeNull()
    expect(gerado.scriptError).toBeNull()
    expect(scripts).toHaveLength(1)
    expect(scripts[0].kind).toBe('carousel')
    expect(scripts[0].account_id).toBe('a1')
  })

  it('devolve o resultado mesmo quando a gravação falha — o dono já pagou a geração', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    forceInsertError = 'conexão com o banco caiu'

    const gerado = await generateCarousel(input())

    expect(gerado.output).toEqual(mockCarousel(input()))
    expect(gerado.script).toBeNull()
    expect(gerado.scriptError).toBe('conexão com o banco caiu')
  })
})
