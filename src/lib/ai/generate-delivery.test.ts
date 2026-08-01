import { afterEach, describe, expect, it, vi } from 'vitest'

import { MOCK_MODEL } from '@/lib/ai/generate'
import {
  buildDeliveryUserPrompt,
  generateDelivery,
  mockDelivery,
  type GenerateDeliveryInput,
} from '@/lib/ai/generate-delivery'
import { deliverySchema } from '@/lib/ai/schemas'
import type { FunnelStage, Persona } from '@/types/db'

/**
 * Mesmo motivo do mock do roteiro (`generate.test.ts`): é caminho de
 * produção, não enfeite de teste. Nenhum caso aqui toca a rede —
 * `ANTHROPIC_API_KEY` é apagada de propósito.
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

const stage: FunnelStage = {
  id: 's-meio',
  account_id: 'a1',
  persona_id: 'p1',
  key: 'meio',
  label: 'meio',
  cta_instruction: 'Peça para comentar a palavra e receber o passo a passo.',
  sort_order: 0,
  created_at: '2026-07-01T00:00:00Z',
}

function input(overrides: Partial<GenerateDeliveryInput> = {}): GenerateDeliveryInput {
  return {
    persona,
    stage,
    promise: 'Comenta DOCE aqui que eu te mando o mapa do ponto certo do brigadeiro.',
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('mockDelivery', () => {
  it('produz uma entrega que passa no mesmo schema da IA', () => {
    expect(deliverySchema.safeParse(mockDelivery(input())).success).toBe(true)
  })

  it('é determinística: mesma entrada, mesma entrega', () => {
    expect(mockDelivery(input())).toEqual(mockDelivery(input()))
  })

  it('leva a promessa literal, não um texto genérico', () => {
    const entrega = mockDelivery(input())

    expect(JSON.stringify(entrega)).toContain('mapa do ponto certo do brigadeiro')
  })
})

describe('buildDeliveryUserPrompt', () => {
  it('leva a promessa literal do CTA, não o tema', () => {
    const prompt = buildDeliveryUserPrompt(input())

    expect(prompt).toContain('Comenta DOCE aqui que eu te mando o mapa do ponto certo do brigadeiro.')
  })

  it('leva a instrução da etapa do funil', () => {
    const prompt = buildDeliveryUserPrompt(input())

    expect(prompt).toContain('Peça para comentar a palavra e receber o passo a passo.')
  })
})

describe('generateDelivery', () => {
  it('usa o mock e marca o modelo quando não há chave', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const gerado = await generateDelivery(input())

    expect(gerado.model).toBe(MOCK_MODEL)
    expect(gerado.output).toEqual(mockDelivery(input()))
  })

  it('não inventa contagem de token no caminho do mock', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    const gerado = await generateDelivery(input())

    expect(gerado.tokensIn).toBeNull()
    expect(gerado.tokensOut).toBeNull()
  })
})
