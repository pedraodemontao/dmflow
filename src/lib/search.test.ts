import { describe, expect, it } from 'vitest'

import { matchesQuery, normalize, stripHandle } from '@/lib/search'

describe('normalize', () => {
  it('tira acento e caixa', () => {
    expect(normalize('Automações')).toBe('automacoes')
    expect(normalize('Ice Breakers')).toBe('ice breakers')
  })

  it('não mexe em texto já normalizado', () => {
    expect(normalize('painel')).toBe('painel')
  })
})

describe('matchesQuery', () => {
  it('acha item acentuado com busca sem acento', () => {
    expect(matchesQuery('Automações', 'automacoes')).toBe(true)
    expect(matchesQuery('Nova automação', 'AUTOMACAO')).toBe(true)
  })

  it('aceita os termos em qualquer ordem', () => {
    expect(matchesQuery('Nova automação', 'nova auto')).toBe(true)
    expect(matchesQuery('Nova automação', 'auto nova')).toBe(true)
  })

  it('exige todos os termos', () => {
    expect(matchesQuery('Nova automação', 'nova contato')).toBe(false)
  })

  it('busca vazia casa com tudo — é o estado inicial da paleta', () => {
    expect(matchesQuery('Painel', '')).toBe(true)
    expect(matchesQuery('Painel', '   ')).toBe(true)
  })

  it('não casa o que não tem nada a ver', () => {
    expect(matchesQuery('Conversas', 'painel')).toBe(false)
  })
})

describe('stripHandle', () => {
  it('tira o arroba que o usuário digita', () => {
    expect(stripHandle('@fulano')).toBe('fulano')
    expect(stripHandle('  @fulano  ')).toBe('fulano')
  })

  it('deixa passar o que não tem arroba', () => {
    expect(stripHandle('fulano')).toBe('fulano')
  })

  it('sobra vazio quando só tem arroba — quem chama trata como busca curta', () => {
    expect(stripHandle('@')).toBe('')
  })
})
