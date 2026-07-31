/**
 * O vocabulário do recorte — ordem e estado — em módulo próprio porque é a
 * única parte da biblioteca que os DOIS lados precisam: o servidor para montar
 * a query, o cliente para desenhar os controles.
 *
 * Estava dentro de `queries.ts`, que importa `server-only`, e isso derrubava o
 * build: o `import type` some na compilação, mas `LIBRARY_ORDER_LABEL` é valor
 * e arrastava o módulo inteiro — junto com o client do Supabase — para dentro
 * do bundle do navegador. Constante compartilhada entre servidor e cliente não
 * pode morar em arquivo com acesso ao banco.
 */

export type LibraryOrder = 'outlier' | 'plays' | 'recentes'
export type LibraryStatus = 'todos' | 'nao-vistos' | 'vistos'

export const LIBRARY_ORDERS: readonly LibraryOrder[] = ['outlier', 'plays', 'recentes']
export const LIBRARY_STATUSES: readonly LibraryStatus[] = ['todos', 'nao-vistos', 'vistos']

export const LIBRARY_ORDER_LABEL: Record<LibraryOrder, string> = {
  outlier: 'Outlier',
  plays: 'Plays',
  recentes: 'Mais recentes',
}

export const LIBRARY_STATUS_LABEL: Record<LibraryStatus, string> = {
  todos: 'Todos',
  'nao-vistos': 'Não vistos',
  vistos: 'Assistidos',
}

/**
 * Ordem padrão: outlier.
 *
 * Não é preferência — é o motivo de a tela existir. Ordenar por plays absolutos
 * ranqueia TAMANHO DE AUDIÊNCIA, e tamanho de audiência não é replicável: 100
 * mil plays num perfil de 1 milhão de seguidores é rotina, e num de 5 mil é um
 * evento. O outlier normaliza pelo próprio perfil, que é a única forma de a
 * lista responder "o que vale modelar" em vez de "quem é grande". Ver o
 * cabeçalho de `src/lib/library/outlier.ts`.
 */
export const LIBRARY_ORDER_PADRAO: LibraryOrder = 'outlier'

/** Parâmetro de URL é entrada de usuário: valor desconhecido cai no padrão. */
export function parseOrder(raw: string | undefined): LibraryOrder {
  return raw === 'plays' || raw === 'recentes' || raw === 'outlier' ? raw : LIBRARY_ORDER_PADRAO
}

export function parseStatus(raw: string | undefined): LibraryStatus {
  return raw === 'vistos' || raw === 'nao-vistos' ? raw : 'todos'
}
