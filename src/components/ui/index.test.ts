import { describe, expect, it } from 'vitest'

import { getInitials } from '@/components/ui'

describe('getInitials', () => {
  it('usa as duas primeiras letras do @ (sem espaço)', () => {
    expect(getInitials('@opedrobarros_')).toBe('OP')
  })

  it('remove o @ antes de gerar as iniciais', () => {
    expect(getInitials('@ana')).toBe('AN')
  })

  it('nome com espaço vira a inicial das duas primeiras palavras', () => {
    expect(getInitials('Pedro Barros')).toBe('PB')
  })

  it('nome com mais de duas palavras usa só as duas primeiras', () => {
    expect(getInitials('Pedro Henrique Barros')).toBe('PH')
  })

  it('string vazia cai para "?"', () => {
    expect(getInitials('')).toBe('?')
  })

  it('só espaços cai para "?"', () => {
    expect(getInitials('   ')).toBe('?')
  })

  it('só o @ sozinho cai para "?"', () => {
    expect(getInitials('@')).toBe('?')
  })

  it('uma letra só ainda funciona', () => {
    expect(getInitials('a')).toBe('A')
  })

  it('sempre maiúsculo', () => {
    expect(getInitials('@lowercase')).toBe('LO')
  })
})
