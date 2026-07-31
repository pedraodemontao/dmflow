/**
 * Busca da paleta de comandos. Vive fora de `data.ts` de propósito: aqui só
 * tem função pura (roda no cliente, para filtrar os itens de navegação, e no
 * servidor, para filtrar automação por nome). Quem fala com o banco é a rota
 * `/api/busca`, que reaproveita `getContacts`/`getAutomations`.
 */

/** Contato como a paleta precisa — nada do resto da linha do banco. */
export interface SearchContact {
  id: string
  /** `@usuario` quando existe; senão o id do Instagram. */
  label: string
  detail: string | null
  avatarUrl: string | null
  verified: boolean
}

export interface SearchAutomation {
  /** Id do TRIGGER — é ele que abre o builder (`/automacoes/{id}`). */
  id: string
  name: string
  isActive: boolean
}

export interface SearchResponse {
  contacts: SearchContact[]
  automations: SearchAutomation[]
}

/** Bloco de diacríticos combinantes que o NFD separa do caractere base. */
const COMBINING_MARKS = /[\u0300-\u036f]/g

/**
 * Caixa baixa e sem acento, para "automacoes" achar "Automações". Usa o
 * intervalo acima em vez de `\p{Diacritic}` porque o alvo do tsconfig é ES2017
 * e property escape em regex só existe a partir de ES2018.
 */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

/**
 * Todo termo da busca precisa aparecer em algum lugar do texto, em qualquer
 * ordem — "nova auto" acha "Nova automação" e "auto nova" também. Busca vazia
 * casa com tudo: é o estado inicial da paleta, que lista as rotas todas.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const target = normalize(haystack)
  return terms.every((term) => target.includes(term))
}

/**
 * Tira o `@` da frente. O usuário digita "@fulano" (é como o contato aparece
 * na lista), mas a coluna `username` guarda sem arroba — sem isto o
 * `ilike %@fulano%` do `getContacts` nunca casa.
 */
export function stripHandle(query: string): string {
  return query.trim().replace(/^@+/, '')
}
