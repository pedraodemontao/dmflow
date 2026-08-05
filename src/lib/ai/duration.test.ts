import { describe, expect, it } from 'vitest'

import { MAX_DURATION_SEC } from '@/lib/ai/generate'

/**
 * O teto nasceu de uma decisão de formato do dono (04/08/2026): vídeo curto é
 * o padrão, longo só quando o assunto exigir. Antes disso a duração vinha
 * inteira do molde, e um molde de 77s gerava roteiro de 77s.
 *
 * O teste existe porque as duas regras se contradizem na superfície — "a
 * referência manda na forma" contra "no máximo 50s" — e quem mexer aqui depois
 * precisa ver que a segunda vence a primeira de propósito.
 */
describe('teto de duração', () => {
  it('é 50 segundos', () => {
    expect(MAX_DURATION_SEC).toBe(50)
  })

  it('molde curto passa inteiro, molde longo é cortado no teto', () => {
    const alvo = (molde: number) => Math.min(molde, MAX_DURATION_SEC)
    expect(alvo(34)).toBe(34)
    expect(alvo(42)).toBe(42)
    expect(alvo(50)).toBe(50)
    expect(alvo(77)).toBe(50)
    expect(alvo(171)).toBe(50)
  })
})
