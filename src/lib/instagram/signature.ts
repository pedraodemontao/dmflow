import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/**
 * A Meta assina cada POST do webhook com HMAC-SHA256 do corpo cru usando o app secret.
 * Precisa ser o corpo cru: reserializar o JSON muda os bytes e quebra a comparação.
 *
 * SÃO DOIS SEGREDOS POSSÍVEIS, e essa é a armadilha que este arquivo existe
 * para desarmar. O projeto tem dois apps na Meta: o do Facebook
 * (`1300921041880198`) e o do Instagram (`2815946815447454`), criado à parte
 * pelo produto Instagram, com credenciais próprias. Quem assina o webhook é o
 * app DONO DA INSCRIÇÃO — e a inscrição `object=instagram` está no app do
 * Facebook, enquanto `INSTAGRAM_APP_SECRET` (a que o OAuth usa, corretamente)
 * é a do outro.
 *
 * Com o segredo errado o HMAC nunca bate, a rota devolve 401, e a Meta não
 * reclama: o sintoma é entrega ZERO pelo webhook, sem erro e sem log. Medido
 * em 24/08/2026 — 68 eventos no histórico, todos pela varredura.
 *
 * Aceitar as duas é o mesmo padrão de quem rotaciona segredo sem derrubar
 * tráfego, e não afrouxa nada: as duas chaves são nossas, e quem não tem
 * nenhuma delas continua sem passar.
 */
export type SignatureSource = 'instagram' | 'facebook'

export type SignatureCheck =
  | { valid: true; source: SignatureSource }
  | { valid: false; reason: 'sem_cabecalho' | 'formato_invalido' | 'nao_confere' }

function matches(rawBody: string, received: Buffer, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}

/**
 * Diz QUAL segredo bateu, e não só que bateu, porque essa é a única forma de
 * descobrir qual app a Meta está usando de verdade — a documentação não
 * responde e o painel não mostra. Quem chama loga a resposta; quando estiver
 * claro qual é, o outro segredo pode sair.
 */
export function checkSignature(rawBody: string, header: string | null): SignatureCheck {
  if (!header) return { valid: false, reason: 'sem_cabecalho' }
  if (!header.startsWith('sha256=')) return { valid: false, reason: 'formato_invalido' }

  const hex = header.slice('sha256='.length)
  // `Buffer.from(..., 'hex')` para em caractere inválido em vez de lançar, e
  // devolveria um buffer curto que só falharia na comparação de tamanho — o
  // que confundiria "assinatura malformada" com "assinatura de outra chave".
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    return { valid: false, reason: 'formato_invalido' }
  }

  const received = Buffer.from(hex, 'hex')

  if (matches(rawBody, received, env.INSTAGRAM_APP_SECRET)) {
    return { valid: true, source: 'instagram' }
  }

  const facebook = env.META_APP_SECRET
  if (facebook && matches(rawBody, received, facebook)) {
    return { valid: true, source: 'facebook' }
  }

  return { valid: false, reason: 'nao_confere' }
}

/** Mantida para quem só precisa do sim/não. */
export function isValidSignature(rawBody: string, header: string | null): boolean {
  return checkSignature(rawBody, header).valid
}
