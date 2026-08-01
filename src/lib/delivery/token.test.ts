import { describe, expect, it } from 'vitest'

import { signDeliveryToken, verifyDeliveryToken } from '@/lib/delivery/token'

/**
 * A única defesa entre "quem abriu o link" e "qualquer um forja o contato de
 * outra pessoa". Sem HMAC por cima, o UUID cru na URL seria suficiente para
 * inflar a métrica de visitas de qualquer contato à vontade.
 */

const SECRET = 'segredo-de-teste-bem-comprido'
const CONTACT_ID = '11111111-1111-1111-1111-111111111111'

describe('signDeliveryToken / verifyDeliveryToken', () => {
  it('assina e verifica o mesmo contact_id', () => {
    const token = signDeliveryToken(CONTACT_ID, SECRET)

    expect(verifyDeliveryToken(token, SECRET)).toBe(CONTACT_ID)
  })

  it('rejeita token ausente sem lançar', () => {
    expect(verifyDeliveryToken(null, SECRET)).toBeNull()
    expect(verifyDeliveryToken(undefined, SECRET)).toBeNull()
    expect(verifyDeliveryToken('', SECRET)).toBeNull()
  })

  it('rejeita token forjado: payload trocado, mesmo mac', () => {
    const token = signDeliveryToken(CONTACT_ID, SECRET)
    const [, mac] = token.split('.')
    const outroContato = '22222222-2222-2222-2222-222222222222'
    const forjado = `${Buffer.from(outroContato, 'utf8').toString('base64url')}.${mac}`

    expect(verifyDeliveryToken(forjado, SECRET)).toBeNull()
  })

  it('rejeita token assinado com outro segredo', () => {
    const token = signDeliveryToken(CONTACT_ID, 'outro-segredo-diferente')

    expect(verifyDeliveryToken(token, SECRET)).toBeNull()
  })

  it('rejeita token malformado (sem o separador do mac)', () => {
    expect(verifyDeliveryToken('so-um-pedaco-sem-ponto', SECRET)).toBeNull()
  })

  it('rejeita mac com tamanho diferente sem lançar', () => {
    const token = signDeliveryToken(CONTACT_ID, SECRET)
    const [payload] = token.split('.')

    expect(verifyDeliveryToken(`${payload}.ab`, SECRET)).toBeNull()
  })
})
