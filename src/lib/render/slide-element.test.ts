import { describe, expect, it } from 'vitest'

import type { CarouselSlide } from '@/lib/ai/schemas'
import { FONT_FAMILY, ctaKeywordFontSize, slideElement, type Brand } from '@/lib/render/slide-element'

/**
 * O que importa testar aqui é a DECISÃO, não o pixel: satori não roda no
 * vitest (precisa do runtime Node completo pra rasterizar). `slideElement`
 * devolve uma árvore de elementos React puros — objetos com `.props.children`
 * — e dá pra inspecionar isso sem montar DOM nenhum.
 */

interface ElementLike {
  props?: { children?: unknown }
}

function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(texts)
  if (node && typeof node === 'object' && 'props' in node) {
    return texts((node as ElementLike).props?.children)
  }
  return []
}

function allText(slide: CarouselSlide, index: number, total: number, brand: Brand): string {
  return texts(slideElement(slide, index, total, brand)).join(' ')
}

const brand: Brand = { handle: 'docesdaju', ctaKeyword: 'DOCE' }

describe('slideElement', () => {
  it('a capa mostra @handle e NÃO mostra paginação', () => {
    const slide: CarouselSlide = { kind: 'cover', title: 'O ponto do brigadeiro' }
    const text = allText(slide, 0, 5, brand)

    expect(text).toContain('@docesdaju')
    expect(text).not.toMatch(/01\s*\/\s*05/)
  })

  it('o body mostra n/N, não o handle', () => {
    const slide: CarouselSlide = { kind: 'body', title: 'Passo 1', body: 'Texto do passo.' }
    const text = allText(slide, 1, 5, brand)

    expect(text).toContain('02 / 05')
    expect(text).not.toContain('@docesdaju')
  })

  it('o cta mostra a palavra-chave, mesmo que o título do modelo não repita ela', () => {
    const slide: CarouselSlide = { kind: 'cta', title: 'Fechamento qualquer, sem a palavra' }
    const text = allText(slide, 4, 5, brand)

    expect(text).toContain('DOCE')
  })

  it('corta palavra-chave absurdamente longa — persona.cta_keyword não tem teto no banco', () => {
    const slide: CarouselSlide = { kind: 'cta', title: 'Comenta' }
    const longa = 'UMAPALAVRACHAVEENORMEESEMESPACONENHUM'
    const text = allText(slide, 4, 5, { handle: 'x', ctaKeyword: longa })

    expect(text).not.toContain(longa.toUpperCase())
    expect(text).toContain('UMAPALAVRACHAVEEN')
  })

  it('o cta troca de palavra-chave conforme a persona — não é texto fixo no código', () => {
    const slide: CarouselSlide = { kind: 'cta', title: 'Comenta' }
    const text = allText(slide, 4, 5, { handle: 'outraconta', ctaKeyword: 'SERRA' })

    expect(text).toContain('SERRA')
    expect(text).not.toContain('DOCE')
  })

  it('body e cover não ganham o selo de cta', () => {
    const cover = allText({ kind: 'cover', title: 'Capa' }, 0, 3, brand)
    const body = allText({ kind: 'body', title: 'Meio', body: 'x' }, 1, 3, brand)

    expect(cover).not.toContain('DOCE')
    expect(body).not.toContain('DOCE')
  })

  it('registra os três nomes de família que render-slide.ts espera encontrar', () => {
    // Documenta o acoplamento: mudar aqui sem mudar `render-slide.ts` faz o
    // satori cair pra fonte de sistema, em silêncio.
    expect(FONT_FAMILY).toEqual({
      title: 'Quantia Title',
      body: 'Quantia Body',
      label: 'Quantia Label',
    })
  })
})

describe('ctaKeywordFontSize', () => {
  it('desce em degraus para a palavra longa caber na caixa', () => {
    expect(ctaKeywordFontSize('DOCE'.length)).toBe(72)
    expect(ctaKeywordFontSize('COMPARTILHA'.length)).toBe(56)
    expect(ctaKeywordFontSize('COMPARTILHAMENTO'.length)).toBe(44)
  })
})
