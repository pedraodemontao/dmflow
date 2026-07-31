/**
 * Classificação de erro de envio da Meta: permanente ou transitório.
 *
 * Existe por causa de um furo estrutural: até aqui `send()` transformava
 * qualquer resposta de erro numa `Error` genérica com o corpo serializado
 * dentro da mensagem. Ninguém lia `error.code` nem `error_subcode`, então
 * payload inválido — carrossel malformado, PDF que não é PDF, texto acima do
 * limite — era retentado igual a instabilidade de rede.
 *
 * A consequência não era só desperdício. Como `startFlow` não bloqueava run em
 * `failed`, cada retentativa criava um run novo e recomeçava do primeiro
 * bloco: o contato recebia de novo TODAS as mensagens já entregues antes da
 * falha. Mensagem repetida em volume é exatamente o padrão que o filtro de
 * spam do Instagram pega, e foi o que custou restrição de conta em jul/2026.
 *
 * FONTE: a tabela oficial de códigos de messaging da Meta estava fora do ar
 * (404/500) quando esta lista foi montada. Ela vem de compilação de terceiros
 * e de thread da própria Meta, e só `10/2534022` aparece corroborado em fonte
 * oficial. Por isso a regra de ouro abaixo: **o desconhecido é tratado como
 * transitório**. Classificar errado como permanente perderia mensagem de
 * verdade; classificar errado como transitório só gasta retentativa, e a
 * espera crescente segura o estrago.
 */

export interface MetaErrorBody {
  error?: {
    code?: number
    error_subcode?: number
    type?: string
    message?: string
  }
}

/**
 * Subcódigos permanentes. Retentar qualquer um destes nunca vai dar certo:
 * ou o payload está errado, ou a política da Meta proíbe, ou a credencial
 * morreu. O que muda entre eles é só o que o dono precisa fazer.
 */
const PERMANENT_SUBCODES = new Set([
  2534022, // Mensagem fora da janela de 24h permitida
  2534025, // Comentário inválido para private reply
  2534015, // Dados da mensagem inválidos (payload malformado)
  2534001, // Conversa arquivada ou apagada
  2534066, // Falta escopo granular do Instagram
  2018047, // Falha no upload do anexo (formato ou tamanho)
  2018034, // Mensagem não pode ser vazia
  2018001, // Usuário não encontrado
  1545041, // "Esta pessoa não está disponível agora"
])

/**
 * Códigos permanentes sem subcódigo. `190` é o token morto — foi ele que
 * apareceu como `OAuthException code 1` na queda de 30/07/2026; a cura é
 * reconectar pelo painel, não insistir.
 */
const PERMANENT_CODES = new Set([
  190, // Token inválido / sessão invalidada
  10900, // Comentário já respondido — uma private reply por comentário
])

/**
 * `368` é bloqueio temporário anti-spam (24–48h). Não é permanente, mas
 * retentar rápido PIORA: é a plataforma dizendo para desacelerar. Fica de fora
 * dos permanentes de propósito, e quem segura o ritmo é a espera crescente da
 * fila.
 */
export class MetaSendError extends Error {
  readonly status: number
  readonly code?: number
  readonly subcode?: number
  /** Retentar não vai adiantar: payload, política ou credencial. */
  readonly permanent: boolean

  constructor(args: {
    status: number
    body: MetaErrorBody
    /** Texto cru, para o caso de a resposta não ser o JSON esperado. */
    raw: string
  }) {
    const meta = args.body.error
    const detail = meta?.message ?? args.raw
    super(`Envio falhou (${args.status}): ${detail}`)

    this.name = 'MetaSendError'
    this.status = args.status
    this.code = meta?.code
    this.subcode = meta?.error_subcode
    this.permanent = isPermanent(meta?.code, meta?.error_subcode)
  }
}

export function isPermanent(code?: number, subcode?: number): boolean {
  if (subcode !== undefined && PERMANENT_SUBCODES.has(subcode)) return true
  if (code !== undefined && PERMANENT_CODES.has(code)) return true
  // Desconhecido é transitório. Ver a regra de ouro no topo do arquivo.
  return false
}

/** `true` quando o erro veio da Meta e não adianta insistir. */
export function isPermanentError(error: unknown): boolean {
  return error instanceof MetaSendError && error.permanent
}
