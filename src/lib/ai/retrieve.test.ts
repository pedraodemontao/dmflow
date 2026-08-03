import { describe, expect, it } from 'vitest'

import { formatHookPatterns, formatRefs, scoreLibrary } from '@/lib/ai/retrieve'
import type { LibraryItem } from '@/types/db'

/**
 * O grounding é o que separa "roteiro genérico" de "roteiro modelado". Quando
 * ele escolhe mal, o roteiro continua saindo — só que sem a inteligência que
 * justificava a feature. Falha silenciosa, logo tem teste.
 */

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'i1',
    account_id: 'a1',
    persona_id: null,
    profile_id: null,
    source: 'instagram',
    owner_handle: 'perfil',
    category: null,
    post_type: 'reel',
    external_url: 'https://instagram.com/reel/1',
    thumb_url: null,
    views: 0,
    plays: 1000,
    likes: 0,
    comments: 0,
    duration_sec: null,
    caption: '',
    posted_at: null,
    visual_format: null,
    format_desc: null,
    hook_text: null,
    structure: null,
    engagement: null,
    outlier: null,
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

describe('scoreLibrary', () => {
  it('deixa o viral fora do assunto passar na frente de UM termo do tema', () => {
    // Não é bug: o que se modela é formato, e o arco de um viral ensina mais
    // que um vídeo morno sobre o assunto certo. Ver o comentário de
    // OUTLIER_WEIGHT — este caso é o que trava a conta dos pesos.
    const noTema = item({ id: 'tema', caption: 'o ponto do brigadeiro', outlier: null })
    const viral = item({ id: 'viral', caption: 'bastidor da loja', outlier: 9 })

    expect(scoreLibrary([viral, noTema], 'brigadeiro').map((x) => x.id)).toEqual(['viral', 'tema'])
  })

  it('a partir de dois termos do tema, tema volta a mandar', () => {
    const noTema = item({ id: 'tema', caption: 'o ponto do brigadeiro cremoso', outlier: null })
    const viral = item({ id: 'viral', caption: 'bastidor da loja', outlier: 9 })

    expect(scoreLibrary([viral, noTema], 'brigadeiro cremoso').map((x) => x.id)).toEqual([
      'tema',
      'viral',
    ])
  })

  it('desempata pelo outlier quando os dois falam do tema', () => {
    const fraco = item({ id: 'fraco', caption: 'brigadeiro cremoso', outlier: 1 })
    const forte = item({ id: 'forte', caption: 'brigadeiro cremoso', outlier: 8 })

    expect(scoreLibrary([fraco, forte], 'brigadeiro').map((x) => x.id)).toEqual(['forte', 'fraco'])
  })

  it('ignora palavra curta e palavra de ligação, que casam com tudo', () => {
    const comStop = item({ id: 'stop', caption: 'uma coisa para o dia' })
    const semNada = item({ id: 'nada', caption: 'texto qualquer' })

    // "para" e "dia" não podem pontuar: o resultado tem que empatar e manter a ordem.
    expect(scoreLibrary([comStop, semNada], 'para o dia').map((x) => x.id)).toEqual([
      'stop',
      'nada',
    ])
  })

  it('é determinístico no empate — o mesmo pedido tem que gerar o mesmo prompt', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]

    expect(scoreLibrary(items, 'nada a ver').map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('respeita o limite', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]

    expect(scoreLibrary(items, 'x', 2)).toHaveLength(2)
  })
})

describe('formatRefs', () => {
  it('leva autor, plays, multiplicador e estrutura', () => {
    const linha = formatRefs([
      item({ owner_handle: 'docesdaju', plays: 112806, outlier: 3.4, caption: 'legenda', structure: 'gancho > prova' }),
    ])

    expect(linha).toContain('@docesdaju')
    expect(linha).toContain('112806 plays')
    expect(linha).toContain('3.4× a mediana do perfil')
    expect(linha).toContain('gancho > prova')
  })

  it('omite o multiplicador quando não dá para afirmar nada', () => {
    expect(formatRefs([item({ outlier: null })])).not.toContain('mediana')
  })
})

describe('formatHookPatterns', () => {
  it('devolve null quando nenhum gancho foi extraído ainda', () => {
    expect(formatHookPatterns([item(), item({ hook_text: '  ' })])).toBeNull()
  })

  it('ordena os ganchos pelo quanto o vídeo estourou', () => {
    const bloco = formatHookPatterns([
      item({ id: '1', hook_text: 'gancho fraco', outlier: 1 }),
      item({ id: '2', hook_text: 'gancho forte', outlier: 7 }),
    ])

    expect(bloco).not.toBeNull()
    expect(bloco!.indexOf('gancho forte')).toBeLessThan(bloco!.indexOf('gancho fraco'))
  })
})
