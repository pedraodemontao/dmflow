/**
 * Validação das respostas do nó `ask`. Devolve o valor normalizado —
 * é ele que vai para as variáveis, não o texto cru: telefone entra
 * "(11) 9 9999-9999" e sai "11999999999".
 */

export type Expect = 'text' | 'email' | 'phone' | 'number'

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export function validateAnswer(expect: Expect, raw: string): { ok: boolean; value: string } {
  const text = raw.trim()
  if (!text) return { ok: false, value: '' }

  switch (expect) {
    case 'email': {
      // Pontuação colada é comum ("meu email é x@y.com.") e não pode invalidar.
      const candidate = text
        .split(/\s+/)
        .map((word) => word.replace(/^[<("']+/, '').replace(/[>)"'.,;:!?]+$/, ''))
        .find((word) => EMAIL.test(word))

      return candidate ? { ok: true, value: candidate.toLowerCase() } : { ok: false, value: text }
    }

    case 'phone': {
      const digits = text.replace(/\D/g, '')
      // Brasil: 10 (fixo com DDD) a 11 (celular). Com +55 vira 12–13.
      if (digits.length < 10 || digits.length > 13) return { ok: false, value: text }
      return { ok: true, value: digits.replace(/^55(?=\d{10,11}$)/, '') }
    }

    case 'number': {
      const match = text.replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/)
      return match ? { ok: true, value: match[0] } : { ok: false, value: text }
    }

    case 'text':
      return { ok: true, value: text }
  }
}

export const RETRY_FALLBACK: Record<Expect, string> = {
  text: 'Não entendi, pode escrever de novo?',
  email: 'Esse e-mail não parece válido. Pode conferir e mandar de novo?',
  phone: 'Esse telefone não parece válido. Manda com DDD, por favor.',
  number: 'Preciso de um número. Pode mandar só o número?',
}
