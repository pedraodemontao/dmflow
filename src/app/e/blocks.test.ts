import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DeliveryBlocks } from '@/app/e/blocks'
import type { DeliveryBlock } from '@/lib/ai/schemas'

/**
 * A página pública é o produto — bloco que não renderiza é presente que não
 * chega. `.ts`, não `.tsx`: `[slug]/` como diretório vizinho tem colchetes, e
 * um glob de teste ali dentro corre risco de casar errado; `createElement`
 * em vez de JSX evita precisar de `.tsx` para este arquivo.
 *
 * Sem `@testing-library/react` (não é dependência do projeto): HTML estático
 * via `renderToStaticMarkup` é suficiente para confirmar que cada tipo de
 * bloco chega ao marcador certo — não há interação para testar aqui.
 */

function render(blocks: DeliveryBlock[]): string {
  return renderToStaticMarkup(createElement(DeliveryBlocks, { blocks }))
}

describe('DeliveryBlocks', () => {
  it('renderiza heading', () => {
    expect(render([{ type: 'heading', text: 'Título da seção' }])).toContain('Título da seção')
  })

  it('renderiza paragraph', () => {
    expect(render([{ type: 'paragraph', text: 'Texto corrido.' }])).toContain('Texto corrido.')
  })

  it('renderiza list como <ul> com um <li> por item', () => {
    const html = render([{ type: 'list', items: ['primeiro', 'segundo'] }])

    expect(html).toContain('<ul')
    expect(html).toContain('primeiro')
    expect(html).toContain('segundo')
  })

  it('renderiza checklist com um item por marca', () => {
    const html = render([{ type: 'checklist', items: ['marcar isto'] }])

    expect(html).toContain('marcar isto')
  })

  it('renderiza steps com título e texto de cada passo, numerados', () => {
    const html = render([
      {
        type: 'steps',
        items: [
          { title: 'Primeiro passo', text: 'faça isto' },
          { title: 'Segundo passo', text: 'depois isto' },
        ],
      },
    ])

    expect(html).toContain('Primeiro passo')
    expect(html).toContain('faça isto')
    expect(html).toContain('Segundo passo')
    expect(html).toContain('Passo 1')
    expect(html).toContain('Passo 2')
  })

  it('renderiza quote', () => {
    expect(render([{ type: 'quote', text: 'uma frase de destaque' }])).toContain(
      'uma frase de destaque',
    )
  })

  it('renderiza callout', () => {
    expect(render([{ type: 'callout', text: 'atenção aqui' }])).toContain('atenção aqui')
  })

  it('renderiza os sete tipos juntos, na ordem em que vêm', () => {
    const blocks: DeliveryBlock[] = [
      { type: 'heading', text: 'A' },
      { type: 'paragraph', text: 'B' },
      { type: 'list', items: ['C'] },
      { type: 'checklist', items: ['D'] },
      { type: 'steps', items: [{ title: 'E', text: 'F' }] },
      { type: 'quote', text: 'G' },
      { type: 'callout', text: 'H' },
    ]

    const html = render(blocks)
    const positions = ['A', 'B', 'C', 'D', 'E', 'G', 'H'].map((marker) => html.indexOf(marker))

    expect(positions.every((position) => position !== -1)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })
})
