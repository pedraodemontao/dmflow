import { describe, expect, it } from 'vitest'

import { validateAnswer } from '@/lib/flow/validate-answer'

/**
 * O que o bloco "Perguntar" aceita vira lead no CSV. Validação frouxa demais
 * enche a base de lixo; rígida demais faz o fluxo repreguntar para quem
 * respondeu certo e o lead desiste.
 */
describe('validateAnswer', () => {
  describe('e-mail', () => {
    it('aceita e normaliza para minúsculas', () => {
      expect(validateAnswer('email', 'PEDRO@Gmail.COM')).toEqual({
        ok: true,
        value: 'pedro@gmail.com',
      })
    })

    it('extrai de dentro de uma frase', () => {
      expect(validateAnswer('email', 'meu email é pedro@gmail.com ok?').value).toBe(
        'pedro@gmail.com',
      )
    })

    it.each([
      'meu email é pedro@gmail.com.',
      'pedro@gmail.com,',
      '<pedro@gmail.com>',
      '"pedro@gmail.com"',
      'é pedro@gmail.com!',
    ])('tolera pontuação colada: %s', (input) => {
      expect(validateAnswer('email', input)).toEqual({ ok: true, value: 'pedro@gmail.com' })
    })

    it.each(['pedro@gmail', 'pedro.gmail.com', 'sem email aqui', '@gmail.com'])(
      'recusa inválido: %s',
      (input) => {
        expect(validateAnswer('email', input).ok).toBe(false)
      },
    )
  })

  describe('telefone', () => {
    it('normaliza para só dígitos', () => {
      expect(validateAnswer('phone', '(11) 9 9999-8888')).toEqual({
        ok: true,
        value: '11999998888',
      })
    })

    it('remove o 55 do início quando sobra um número brasileiro válido', () => {
      expect(validateAnswer('phone', '+55 11 99998888').value).toBe('1199998888')
    })

    it('aceita fixo com DDD (10 dígitos)', () => {
      expect(validateAnswer('phone', '1133334444').ok).toBe(true)
    })

    it.each(['9999', '', 'meu telefone', '1'])('recusa: %s', (input) => {
      expect(validateAnswer('phone', input).ok).toBe(false)
    })
  })

  describe('número', () => {
    it('extrai de dentro da frase', () => {
      expect(validateAnswer('number', 'quero 3 unidades').value).toBe('3')
    })

    it('converte formato brasileiro para decimal com ponto', () => {
      expect(validateAnswer('number', '1.500,50').value).toBe('1500.50')
    })

    it('recusa quando não há número', () => {
      expect(validateAnswer('number', 'muitas').ok).toBe(false)
    })
  })

  describe('texto', () => {
    it('aceita qualquer coisa, só aparando espaços', () => {
      expect(validateAnswer('text', '  oi  ')).toEqual({ ok: true, value: 'oi' })
    })

    it('recusa vazio', () => {
      expect(validateAnswer('text', '   ').ok).toBe(false)
    })
  })
})
