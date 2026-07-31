import { describe, expect, it } from 'vitest'

import { spin } from '@/lib/flow/spintax'

/**
 * Spintax é blindagem anti-flag: texto idêntico repetido em volume é o que o
 * filtro de spam do Instagram derruba. Se estes testes caírem, a automação
 * volta a mandar sempre a mesma frase.
 */
describe('spin', () => {
  it('sorteia uma das opções e não deixa chave sobrando', () => {
    const options = ['oi', 'olá', 'e aí']
    for (let i = 0; i < 50; i += 1) {
      const result = spin('{oi|olá|e aí}')
      expect(options).toContain(result)
      expect(result).not.toMatch(/[{}|]/)
    }
  })

  it('produz mais de um resultado ao longo de várias execuções', () => {
    const seen = new Set(Array.from({ length: 80 }, () => spin('{a|b|c}')))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('resolve vários grupos na mesma frase', () => {
    const result = spin('{Oi|Olá} {fulano|amigo}, {tudo bem|beleza}?')
    expect(result).toMatch(/^(Oi|Olá) (fulano|amigo), (tudo bem|beleza)\?$/)
  })

  it('devolve o texto intacto quando não há spintax', () => {
    expect(spin('Oi, tudo bem?')).toBe('Oi, tudo bem?')
  })

  it('não confunde as chaves duplas da interpolação de variáveis', () => {
    // spin roda DEPOIS do interpolate; se sobrar {{nome}}, não pode virar sorteio.
    expect(spin('Oi {{nome}}, tudo bem?')).toBe('Oi {{nome}}, tudo bem?')
  })

  it('ignora grupo sem alternativa', () => {
    expect(spin('valor {fixo}')).toBe('valor {fixo}')
  })

  it('aceita opção vazia — serve para "às vezes não escrever nada"', () => {
    const results = new Set(Array.from({ length: 60 }, () => spin('oi{| amigo}')))
    expect(results).toContain('oi')
    expect(results).toContain('oi amigo')
  })
})
