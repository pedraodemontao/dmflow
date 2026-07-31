import { describe, expect, it } from 'vitest'

import { MetaSendError, isPermanent, isPermanentError } from '@/lib/instagram/errors'

describe('isPermanent', () => {
  it('reconhece mensagem fora da janela de 24h', () => {
    expect(isPermanent(10, 2534022)).toBe(true)
  })

  it('reconhece token morto pelo código, sem subcódigo', () => {
    expect(isPermanent(190)).toBe(true)
  })

  it('reconhece comentário já respondido', () => {
    expect(isPermanent(10900)).toBe(true)
  })

  it('trata rate limit como transitório', () => {
    expect(isPermanent(613)).toBe(false)
  })

  it('trata bloqueio anti-spam como transitório', () => {
    // 368 é bloqueio de 24-48h: insistir piora, mas a mensagem não está
    // perdida. Quem segura o ritmo é a espera crescente da fila.
    expect(isPermanent(368, 1404169)).toBe(false)
  })

  it('trata código desconhecido como transitório', () => {
    // Regra de ouro: classificar errado como permanente PERDE mensagem;
    // como transitório só gasta retentativa.
    expect(isPermanent(99999, 88888)).toBe(false)
    expect(isPermanent()).toBe(false)
  })
})

describe('MetaSendError', () => {
  it('extrai código, subcódigo e mensagem do corpo da Meta', () => {
    const error = new MetaSendError({
      status: 400,
      body: {
        error: {
          code: 10,
          error_subcode: 2534022,
          message: 'This message is sent outside of allowed window',
        },
      },
      raw: '{}',
    })

    expect(error.code).toBe(10)
    expect(error.subcode).toBe(2534022)
    expect(error.permanent).toBe(true)
    expect(error.message).toContain('outside of allowed window')
  })

  it('sobrevive a resposta que não é o JSON esperado', () => {
    const error = new MetaSendError({ status: 502, body: {}, raw: '<html>gateway</html>' })

    expect(error.permanent).toBe(false)
    expect(error.message).toContain('gateway')
  })

  it('isPermanentError ignora erro que não veio da Meta', () => {
    expect(isPermanentError(new Error('rede caiu'))).toBe(false)
  })
})
