import { describe, expect, it } from 'vitest'

import { toolInputSchema } from '@/lib/ai/anthropic'
import {
  CAROUSEL_CAPTION_MAX_CHARS,
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_MIN_SLIDES,
  HOOK_VARIANTS,
  SLIDE_BODY_MAX_CHARS,
  SLIDE_TITLE_MAX_CHARS,
  carouselSchema,
  deliverySchema,
  parseDeliveryBlocks,
  scriptSchema,
  type Script,
} from '@/lib/ai/schemas'

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

/**
 * A trava entre o modelo e a página pública. Sem ela, HTML ou um tipo de
 * bloco inventado pelo modelo entra em `deliveries.blocks` e ou quebra o
 * componente de render, ou — no caso de HTML livre — vira XSS servido na
 * própria página (ver migration 0016).
 */
describe('deliverySchema', () => {
  function entrega(blocks: unknown[]) {
    return { title: 'Mapa do Conteúdo', subtitle: 'em 7 passos', blocks }
  }

  it('aceita uma entrega com um bloco de cada um dos sete tipos', () => {
    const blocks = [
      { type: 'heading', text: 'Título' },
      { type: 'paragraph', text: 'Texto corrido.' },
      { type: 'list', items: ['item 1', 'item 2'] },
      { type: 'checklist', items: ['marcar isto'] },
      { type: 'steps', items: [{ title: 'Passo 1', text: 'faça isto' }] },
      { type: 'quote', text: 'uma frase de destaque' },
      { type: 'callout', text: 'atenção aqui' },
    ]

    expect(deliverySchema.safeParse(entrega(blocks)).success).toBe(true)
  })

  it('recusa bloco com type que não existe no catálogo', () => {
    const blocks = [{ type: 'video', text: 'não é um bloco válido' }]

    expect(deliverySchema.safeParse(entrega(blocks)).success).toBe(false)
  })

  it('recusa bloco sem o campo que o próprio type exige', () => {
    const listaSemItems = [{ type: 'list' }]
    const stepsSemTitulo = [{ type: 'steps', items: [{ text: 'sem título' }] }]

    expect(deliverySchema.safeParse(entrega(listaSemItems)).success).toBe(false)
    expect(deliverySchema.safeParse(entrega(stepsSemTitulo)).success).toBe(false)
  })

  it('recusa texto vazio — string em branco passa no tipo e não deveria virar bloco', () => {
    const blocks = [{ type: 'paragraph', text: '' }]

    expect(deliverySchema.safeParse(entrega(blocks)).success).toBe(false)
  })

  it('recusa entrega rala demais (menos que o mínimo de blocos)', () => {
    const blocks = [{ type: 'heading', text: 'só isso' }]

    expect(deliverySchema.safeParse(entrega(blocks)).success).toBe(false)
  })

  it('não obriga subtítulo — é opcional', () => {
    const semSubtitulo = {
      title: 'Mapa do Conteúdo',
      blocks: [
        { type: 'heading', text: 'Título' },
        { type: 'paragraph', text: 'Texto.' },
      ],
    }

    expect(deliverySchema.safeParse(semSubtitulo).success).toBe(true)
  })

  it('gera JSON Schema com input_schema para os sete tipos de bloco', () => {
    const json = toolInputSchema(deliverySchema) as {
      properties: { blocks: { items?: { oneOf?: unknown[] } } }
    }

    expect(json.properties.blocks.items?.oneOf).toHaveLength(7)
  })
})

/**
 * A separação entre o que o MODELO escreve e o que a PÁGINA renderiza.
 *
 * O modelo não sobe arquivo. Se ele pudesse emitir um bloco `file`, o caminho
 * seria inventado e o botão de baixar levaria a 404 — falha que só aparece
 * quando o lead clica, que é o pior momento possível.
 *
 * E `parseDeliveryBlocks` valida o ARRAY inteiro: um bloco inválido derruba a
 * lista toda e a página fica em branco. Por isso o anexo precisa estar do lado
 * de dentro aqui, e do lado de fora lá.
 */
describe('anexo: geração × renderização', () => {
  const anexo = { type: 'file', path: 'entrega-1/guia.pdf', label: 'Guia' }

  it('o modelo NÃO pode emitir bloco de arquivo', () => {
    const result = deliverySchema.safeParse({
      title: 'Entrega',
      blocks: [{ type: 'paragraph', text: 'oi' }, anexo],
    })

    expect(result.success).toBe(false)
  })

  it('a página renderiza o anexo salvo pelo dono', () => {
    expect(parseDeliveryBlocks([{ type: 'paragraph', text: 'oi' }, anexo])).toHaveLength(2)
  })

  it('recusa caminho com travessia de diretório', () => {
    expect(parseDeliveryBlocks([{ ...anexo, path: 'a/../../outro/guia.pdf' }])).toEqual([])
  })

  it('recusa caminho que na verdade é URL', () => {
    expect(parseDeliveryBlocks([{ ...anexo, path: 'https://malicioso.com/x.pdf' }])).toEqual([])
  })
})

/**
 * A trava do carrossel (card 05): a ordem dos slides e os tetos de caractere.
 * O satori (`next/og`) não tem shrink-to-fit, então o teto AQUI é a única
 * cerca contra texto que estoura o slide na hora do render.
 */
describe('carouselSchema', () => {
  function slide(overrides: Record<string, unknown> = {}) {
    return { kind: 'body', title: 'Título do slide', body: 'Corpo do slide.', ...overrides }
  }

  function carrossel(overrides: { slides?: unknown[]; caption?: string } = {}) {
    return {
      slides: overrides.slides ?? [
        { kind: 'cover', title: 'A capa' },
        slide(),
        slide(),
        { kind: 'cta', title: 'Comenta PALAVRA', body: 'Comenta aqui embaixo.' },
      ],
      caption: overrides.caption ?? 'legenda do post #nicho',
    }
  }

  it('aceita um carrossel completo, capa → corpo → cta', () => {
    expect(carouselSchema.safeParse(carrossel()).success).toBe(true)
  })

  it('recusa quando o primeiro slide não é cover', () => {
    const semCapa = carrossel({ slides: [slide(), slide(), { kind: 'cta', title: 'Comenta' }] })
    expect(carouselSchema.safeParse(semCapa).success).toBe(false)
  })

  it('recusa quando o último slide não é cta', () => {
    const semCta = carrossel({ slides: [{ kind: 'cover', title: 'A capa' }, slide(), slide()] })
    expect(carouselSchema.safeParse(semCta).success).toBe(false)
  })

  it('recusa cta ou cover no meio', () => {
    const ctaNoMeio = carrossel({
      slides: [
        { kind: 'cover', title: 'A capa' },
        { kind: 'cta', title: 'Comenta cedo demais' },
        { kind: 'cta', title: 'Comenta PALAVRA' },
      ],
    })
    expect(carouselSchema.safeParse(ctaNoMeio).success).toBe(false)
  })

  it(`recusa menos de ${CAROUSEL_MIN_SLIDES} slides`, () => {
    const curto = carrossel({ slides: [{ kind: 'cover', title: 'A capa' }, { kind: 'cta', title: 'Comenta' }] })
    expect(carouselSchema.safeParse(curto).success).toBe(false)
  })

  it(`recusa mais de ${CAROUSEL_MAX_SLIDES} slides`, () => {
    const meio = Array.from({ length: CAROUSEL_MAX_SLIDES }, () => slide())
    const longo = carrossel({ slides: [{ kind: 'cover', title: 'A capa' }, ...meio, { kind: 'cta', title: 'Comenta' }] })
    expect(carouselSchema.safeParse(longo).success).toBe(false)
  })

  it(`recusa título acima de ${SLIDE_TITLE_MAX_CHARS} caracteres — é o teto de RENDER, não de gosto`, () => {
    const tituloLongo = carrossel({
      slides: [
        { kind: 'cover', title: 'x'.repeat(SLIDE_TITLE_MAX_CHARS + 1) },
        slide(),
        { kind: 'cta', title: 'Comenta' },
      ],
    })
    expect(carouselSchema.safeParse(tituloLongo).success).toBe(false)
  })

  it(`recusa corpo acima de ${SLIDE_BODY_MAX_CHARS} caracteres`, () => {
    const corpoLongo = carrossel({
      slides: [
        { kind: 'cover', title: 'A capa' },
        slide({ body: 'x'.repeat(SLIDE_BODY_MAX_CHARS + 1) }),
        { kind: 'cta', title: 'Comenta' },
      ],
    })
    expect(carouselSchema.safeParse(corpoLongo).success).toBe(false)
  })

  it('aceita capa sem body — a capa costuma não precisar', () => {
    const semBodyNaCapa = carrossel({
      slides: [{ kind: 'cover', title: 'A capa' }, slide(), { kind: 'cta', title: 'Comenta' }],
    })
    expect(carouselSchema.safeParse(semBodyNaCapa).success).toBe(true)
  })

  it(`recusa legenda acima de ${CAROUSEL_CAPTION_MAX_CHARS} caracteres — limite da Meta`, () => {
    const legendaLonga = carrossel({ caption: 'x'.repeat(CAROUSEL_CAPTION_MAX_CHARS + 1) })
    expect(carouselSchema.safeParse(legendaLonga).success).toBe(false)
  })
})
