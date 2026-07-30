/**
 * Spintax: `{oi|olá|e aí}` vira uma das opções, sorteada a cada envio.
 * Existe para as respostas automáticas não saírem idênticas — texto repetido
 * em volume é o que o filtro de spam do Instagram derruba. Rodar DEPOIS da
 * interpolação de `{{vars}}`, senão as chaves internas quebram o grupo.
 */
export function spin(text: string): string {
  return text.replace(/\{([^{}|]*(?:\|[^{}|]*)+)\}/g, (_match, group: string) => {
    const options = group.split('|')
    return options[Math.floor(Math.random() * options.length)] ?? ''
  })
}
