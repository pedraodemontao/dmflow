import { describe, expect, it } from 'vitest'

import { QUANTIA } from '@/lib/render/palette'
import { TWEET_TEXT_MAX_CHARS, tweetElement, tweetFontSize } from '@/lib/render/tweet-element'

function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(texts)
  if (node && typeof node === 'object' && 'props' in node) {
    return texts((node as { props?: { children?: unknown } }).props?.children)
  }
  return []
}

describe('tweetElement', () => {
  it('mostra nome, @handle, iniciais e o texto', () => {
    const all = texts(tweetElement({ name: 'Pedro Barros', handle: 'nocodepedro', text: 'A afirmação.' }, QUANTIA)).join(' ')

    expect(all).toContain('Pedro Barros')
    expect(all).toContain('@nocodepedro')
    expect(all).toContain('PB')
    expect(all).toContain('A afirmação.')
  })

  it('corta texto acima do teto em vez de vazar do card', () => {
    const longo = 'x'.repeat(TWEET_TEXT_MAX_CHARS + 50)
    const all = texts(tweetElement({ name: 'A', handle: 'a', text: longo }, QUANTIA)).join(' ')

    expect(all).not.toContain(longo)
  })

  it('o corpo desce em degraus pelo comprimento', () => {
    expect(tweetFontSize(80)).toBe(64)
    expect(tweetFontSize(200)).toBe(54)
    expect(tweetFontSize(500)).toBe(44)
  })
})

describe('quebra de linha', () => {
  it('cada linha do texto vira um bloco próprio', () => {
    const el = tweetElement({ name: 'A', handle: 'a', text: 'primeira linha\n\nsegunda linha' }, QUANTIA)
    const all = texts(el)

    expect(all).toContain('primeira linha')
    expect(all).toContain('segunda linha')
  })
})
