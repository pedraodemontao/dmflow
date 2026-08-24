import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const SEGREDO_DO_INSTAGRAM = 'segredo-do-app-do-instagram'
const SEGREDO_DO_FACEBOOK = 'segredo-do-app-do-facebook'

/**
 * `env` é um Proxy lazy que valida o schema INTEIRO no primeiro acesso — sem
 * as variáveis do Supabase ele estoura, e este teste não tem nada a ver com
 * banco. Por isso o módulo é simulado em vez de o ambiente ser montado.
 */
const ambiente = { INSTAGRAM_APP_SECRET: SEGREDO_DO_INSTAGRAM, META_APP_SECRET: SEGREDO_DO_FACEBOOK }
vi.mock('@/lib/env', () => ({ env: new Proxy({}, { get: (_, chave: string) => ambiente[chave as keyof typeof ambiente] }) }))

const { checkSignature, isValidSignature } = await import('@/lib/instagram/signature')

/**
 * Com espaço depois da vírgula de propósito: é assim que o corpo cru costuma
 * chegar, e é o que faz `JSON.stringify(JSON.parse(corpo))` produzir bytes
 * diferentes — sem isso o teste de reserialização passaria por acidente.
 */
const CORPO = '{"object": "instagram", "entry": [{"id": "1", "changes": []}]}'
const assinar = (corpo: string, segredo: string) =>
  `sha256=${createHmac('sha256', segredo).update(corpo, 'utf8').digest('hex')}`

beforeEach(() => {
  ambiente.INSTAGRAM_APP_SECRET = SEGREDO_DO_INSTAGRAM
  ambiente.META_APP_SECRET = SEGREDO_DO_FACEBOOK
})

/**
 * O projeto tem dois apps na Meta com segredos diferentes, e quem assina o
 * webhook é o dono da inscrição — que não é o mesmo app do OAuth. Validar só
 * com um deles produz 401 silencioso e entrega zero, que foi o estado real
 * medido em 24/08/2026: 68 eventos, nenhum pelo webhook.
 */
describe('checkSignature', () => {
  it('aceita a assinatura de qualquer um dos dois apps, e diz qual foi', () => {
    expect(checkSignature(CORPO, assinar(CORPO, SEGREDO_DO_INSTAGRAM))).toEqual({
      valid: true,
      source: 'instagram',
    })
    expect(checkSignature(CORPO, assinar(CORPO, SEGREDO_DO_FACEBOOK))).toEqual({
      valid: true,
      source: 'facebook',
    })
  })

  it('sem META_APP_SECRET, só o segredo do Instagram vale — o comportamento antigo', () => {
    ambiente.META_APP_SECRET = undefined as unknown as string

    expect(checkSignature(CORPO, assinar(CORPO, SEGREDO_DO_INSTAGRAM)).valid).toBe(true)
    expect(checkSignature(CORPO, assinar(CORPO, SEGREDO_DO_FACEBOOK))).toEqual({
      valid: false,
      reason: 'nao_confere',
    })
  })

  it('recusa assinatura de segredo que não é nosso', () => {
    expect(checkSignature(CORPO, assinar(CORPO, 'chute'))).toEqual({
      valid: false,
      reason: 'nao_confere',
    })
  })

  // O HMAC é sobre o corpo CRU. Reserializar o JSON muda os bytes e a
  // comparação quebra — é o motivo de a rota ler `request.text()`.
  it('recusa quando o corpo muda, mesmo que o JSON seja equivalente', () => {
    const cabecalho = assinar(CORPO, SEGREDO_DO_INSTAGRAM)
    const reserializado = JSON.stringify(JSON.parse(CORPO))

    expect(reserializado).not.toBe(CORPO)
    expect(checkSignature(reserializado, cabecalho).valid).toBe(false)
  })

  it('separa cabeçalho ausente de cabeçalho malformado', () => {
    expect(checkSignature(CORPO, null)).toEqual({ valid: false, reason: 'sem_cabecalho' })
    expect(checkSignature(CORPO, 'sha1=abcd')).toEqual({ valid: false, reason: 'formato_invalido' })
    // `Buffer.from(..., 'hex')` para no caractere inválido em vez de lançar, e
    // devolveria um buffer curto — sem esta checagem, "malformado" viraria
    // "assinatura de outra chave" e mandaria investigar o segredo errado.
    expect(checkSignature(CORPO, 'sha256=nao-e-hex')).toEqual({
      valid: false,
      reason: 'formato_invalido',
    })
    expect(checkSignature(CORPO, 'sha256=abc')).toEqual({
      valid: false,
      reason: 'formato_invalido',
    })
  })

  it('isValidSignature continua respondendo sim ou não', () => {
    expect(isValidSignature(CORPO, assinar(CORPO, SEGREDO_DO_FACEBOOK))).toBe(true)
    expect(isValidSignature(CORPO, null)).toBe(false)
  })
})
