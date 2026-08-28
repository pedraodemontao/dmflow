import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

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

/**
 * O anexo é o único bloco que depende de configuração para funcionar — os
 * outros sete são texto puro. Por isso os dois caminhos estão travados aqui:
 * com bucket configurado tem link de baixar, sem ele sobra o nome do arquivo.
 * Botão que leva a `undefined/storage/...` é pior que botão nenhum.
 */
describe('bloco de arquivo', () => {
  const original = process.env.SUPABASE_URL

  afterEach(() => {
    if (original === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = original
  })

  it('monta o link de download a partir do caminho, nunca de uma URL do bloco', () => {
    process.env.SUPABASE_URL = 'https://exemplo.supabase.co'

    const html = render([
      { type: 'file', path: 'entrega-1/planilha.xlsx', label: 'Planilha de controle' },
    ])

    expect(html).toContain('Planilha de controle')
    expect(html).toContain(
      'https://exemplo.supabase.co/storage/v1/object/public/delivery-files/entrega-1/planilha.xlsx?download',
    )
  })

  it('mostra o tamanho quando ele veio junto', () => {
    process.env.SUPABASE_URL = 'https://exemplo.supabase.co'

    const html = render([
      { type: 'file', path: 'e/guia.pdf', label: 'Guia', sizeBytes: 2 * 1024 * 1024 },
    ])

    expect(html).toContain('2.0 MB')
  })

  it('sem SUPABASE_URL mostra o nome sem link em vez de um botão quebrado', () => {
    delete process.env.SUPABASE_URL

    const html = render([{ type: 'file', path: 'e/guia.pdf', label: 'Guia' }])

    expect(html).toContain('Guia')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('undefined')
  })
})
