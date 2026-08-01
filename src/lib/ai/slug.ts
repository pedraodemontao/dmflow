import { randomBytes } from 'node:crypto'

/**
 * Slug da entrega: kebab-do-título + sufixo aleatório (`mapa-do-conteudo-7fk2qa`).
 *
 * Sequencial ou previsível deixa qualquer um enumerar tudo que já foi
 * entregue — a página é pública e o conteúdo é o produto (ver migration
 * 0016). O sufixo vem de `randomBytes`, não `Math.random`: é o que faz duas
 * entregas com o MESMO título não colidirem.
 */

const SUFFIX_LENGTH = 6
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Teto do trecho do título no slug — título gigante não vira URL gigante. */
const TITLE_SLUG_MAX_LENGTH = 60

function slugifyTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TITLE_SLUG_MAX_LENGTH)
    .replace(/-+$/, '')
}

function randomSuffix(): string {
  const bytes = randomBytes(SUFFIX_LENGTH)
  let suffix = ''
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += SUFFIX_ALPHABET[bytes[i] % SUFFIX_ALPHABET.length]
  }
  return suffix
}

/** Título vazio ou só símbolos (ex: emoji puro) cai aqui em vez de virar slug vazio. */
const FALLBACK_BASE = 'entrega'

export function generateDeliverySlug(title: string): string {
  const base = slugifyTitle(title) || FALLBACK_BASE
  return `${base}-${randomSuffix()}`
}
