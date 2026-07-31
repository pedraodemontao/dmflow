import { describe, expect, it } from 'vitest'

import { toolInputSchema } from '@/lib/ai/anthropic'
import { HOOK_VARIANTS, scriptSchema, type Script } from '@/lib/ai/schemas'

/**
 * A trava entre o modelo e o banco.
 *
 * Sem ela, resposta capenga entra em `scripts.output` e só quebra na tela.
 * Os casos abaixo são as formas de "capenga" que já aconteceram no projeto de
 * origem: gancho a menos, campo faltando, string vazia passando por conteúdo.
 */

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
      { beat: 'CTA', ...take('c') },
    ],
    caption: 'legenda longa #doces',
    ctas: { tiktok: take('tt'), instagram: take('ig') },
    format: { tipo: 'talking head', dica: 'bancada iluminada' },
  }
}

describe('scriptSchema', () => {
  it('aceita um roteiro completo', () => {
    expect(scriptSchema.safeParse(roteiro()).success).toBe(true)
  })

  it(`recusa quando não vêm exatamente ${HOOK_VARIANTS} ganchos`, () => {
    const doisGanchos = { ...roteiro(), hooks: [take('1'), take('2')] }
    const quatroGanchos = { ...roteiro(), hooks: [take('1'), take('2'), take('3'), take('4')] }

    expect(scriptSchema.safeParse(doisGanchos).success).toBe(false)
    expect(scriptSchema.safeParse(quatroGanchos).success).toBe(false)
  })

  it('recusa roteiro sem CTA de plataforma', () => {
    const semCtas: Record<string, unknown> = { ...roteiro() }
    delete semCtas.ctas

    expect(scriptSchema.safeParse(semCtas).success).toBe(false)
  })

  it('recusa string vazia — campo em branco passa no tipo e não passa na gravação', () => {
    const falaVazia = { ...roteiro(), format: { tipo: '', dica: 'x' } }

    expect(scriptSchema.safeParse(falaVazia).success).toBe(false)
  })

  it('recusa roteiro curto demais para ser roteiro', () => {
    const doisBeats = { ...roteiro(), beats: roteiro().beats.slice(0, 2) }

    expect(scriptSchema.safeParse(doisBeats).success).toBe(false)
  })

  it('descarta campo extra inventado pelo modelo em vez de gravá-lo', () => {
    const parsed = scriptSchema.parse({ ...roteiro(), musica: 'trend do momento' })

    expect(parsed).not.toHaveProperty('musica')
  })
})

describe('toolInputSchema', () => {
  const json = toolInputSchema(scriptSchema) as {
    $schema?: string
    type: string
    required: string[]
    properties: Record<string, { minItems?: number; maxItems?: number; description?: string }>
  }

  it('é um objeto JSON Schema pronto para o campo input_schema', () => {
    expect(json.$schema).toBeUndefined()
    expect(json.type).toBe('object')
  })

  it('leva todos os campos como obrigatórios', () => {
    expect(json.required.sort()).toEqual(
      ['beats', 'caption', 'ctas', 'format', 'headline', 'hooks'].sort(),
    )
  })

  it('leva a contagem de ganchos — é a regra que o modelo mais tenta driblar', () => {
    expect(json.properties.hooks.minItems).toBe(HOOK_VARIANTS)
    expect(json.properties.hooks.maxItems).toBe(HOOK_VARIANTS)
  })

  it('leva as descrições, que são metade da instrução que o modelo lê', () => {
    expect(json.properties.headline.description).toBeTruthy()
    expect(json.properties.beats.description).toBeTruthy()
  })
})
