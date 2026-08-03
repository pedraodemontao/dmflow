import { describe, expect, it } from 'vitest'

import { extractLinks, resolvableUrl } from '@/lib/flow/links'
import type { FlowDefinition } from '@/lib/flow/types'

function fluxo(nodes: FlowDefinition['nodes']): FlowDefinition {
  return { entry: Object.keys(nodes)[0] ?? 'entry', nodes }
}

describe('extractLinks', () => {
  it('acha link de botão — o caso do incidente do mapa', () => {
    const links = extractLinks(
      fluxo({
        entrega: {
          type: 'buttons',
          text: 'Pega aqui 👇',
          buttons: [{ title: 'PEGAR O MAPA', url: 'https://nocodepedro.site/mapa?c={{contact_id}}' }],
        },
      }),
    )

    expect(links).toEqual([
      {
        nodeId: 'entrega',
        url: 'https://nocodepedro.site/mapa?c={{contact_id}}',
        label: 'PEGAR O MAPA',
      },
    ])
  })

  it('acha link solto no meio do texto', () => {
    const links = extractLinks(
      fluxo({ abertura: { type: 'message', text: 'entra em https://exemplo.com/x agora' } }),
    )

    expect(links).toEqual([{ nodeId: 'abertura', url: 'https://exemplo.com/x' }])
  })

  it('não engole a pontuação da frase no fim do link', () => {
    const links = extractLinks(
      fluxo({ abertura: { type: 'message', text: 'olha (https://exemplo.com/a) e pronto' } }),
    )

    expect(links[0].url).toBe('https://exemplo.com/a')
  })

  it('ignora o webhook do bloco http — não vai para o lead', () => {
    const links = extractLinks(
      fluxo({ integra: { type: 'http', url: 'https://n8n.interno/hook', method: 'POST' } }),
    )

    expect(links).toEqual([])
  })

  it('acha botão dentro de card de carrossel', () => {
    const links = extractLinks(
      fluxo({
        vitrine: {
          type: 'carousel',
          cards: [
            { title: 'Curso', buttons: [{ title: 'Ver', url: 'https://exemplo.com/curso' }] },
          ],
        },
      }),
    )

    expect(links).toEqual([
      { nodeId: 'vitrine', url: 'https://exemplo.com/curso', label: 'Ver' },
    ])
  })

  it('fluxo sem link nenhum devolve lista vazia', () => {
    expect(extractLinks(fluxo({ oi: { type: 'message', text: 'oi' } }))).toEqual([])
  })
})

describe('resolvableUrl', () => {
  it('troca a variável por valor de teste em vez de pular o link', () => {
    // Pular link com variável deixaria de fora exatamente o caso do `mapa`,
    // que tinha `{{contact_id}}` e estava quebrado.
    expect(resolvableUrl('https://site.com/x?c={{contact_id}}')).toBe('https://site.com/x?c=teste')
  })

  it('recusa {{presente}} — a checagem dele é outra', () => {
    expect(resolvableUrl('{{presente}}')).toBeNull()
    expect(resolvableUrl('https://x.com/{{presente}}')).toBeNull()
  })

  it('deixa passar url sem variável', () => {
    expect(resolvableUrl('https://site.com/a')).toBe('https://site.com/a')
  })
})
