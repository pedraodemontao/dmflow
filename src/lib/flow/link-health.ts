import 'server-only'

import { extractLinks, resolvableUrl, type FlowLink } from '@/lib/flow/links'
import type { FlowDefinition } from '@/lib/flow/types'

/**
 * O link que a automação entrega ainda responde?
 *
 * Sem estado novo no banco de propósito. A alternativa seria uma tabela de
 * checagens alimentada pelo tick, e ela custaria uma migration para responder
 * uma pergunta que quatro requisições respondem na hora. Se um dia houver
 * dezenas de automações, aí sim vale mover para o tick.
 *
 * O cache é o que impede a página de bater no site externo a cada render.
 */

/** Curto: a página do painel espera por isto. Site que demora mais que isso já é problema. */
const TIMEOUT_MS = 6_000

export interface LinkStatus extends FlowLink {
  /** `null` quando não deu para checar (variável não resolvível, ou rede caiu). */
  status: number | null
  ok: boolean
  /** Por que não foi checado, quando for o caso. */
  motivo?: string
}

async function checkOne(link: FlowLink): Promise<LinkStatus> {
  const url = resolvableUrl(link.url)
  if (!url) {
    return { ...link, status: null, ok: true, motivo: 'resolvido no envio' }
  }

  try {
    // GET, não HEAD: hospedagem que serve página estática costuma responder
    // 405 a HEAD, e isso viraria um alarme falso — pior que não avisar.
    // `redirect: follow` porque link encurtado é normal aqui.
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'dm-flow/1.0 (verificador de link)' },
    })

    return { ...link, status: response.status, ok: response.ok }
  } catch (error) {
    // Rede caiu ou estourou o tempo. NÃO é o mesmo que 404: marcamos como não
    // ok, mas com o motivo à vista, para o dono não sair trocando um link que
    // estava certo por causa de uma instabilidade de trinta segundos.
    return {
      ...link,
      status: null,
      ok: false,
      motivo: error instanceof Error && error.name === 'TimeoutError' ? 'não respondeu a tempo' : 'não deu para alcançar',
    }
  }
}

/**
 * Checa os links de um fluxo. Devolve só os que estão com problema — o painel
 * não precisa listar o que está certo, e listar tudo faria o aviso importante
 * se perder no meio.
 */
export async function findBrokenLinks(definition: FlowDefinition): Promise<LinkStatus[]> {
  const links = extractLinks(definition)
  if (links.length === 0) return []

  // Únicos: o mesmo link em dois botões é uma requisição, não duas.
  const vistos = new Map<string, FlowLink>()
  for (const link of links) if (!vistos.has(link.url)) vistos.set(link.url, link)

  const resultados = await Promise.all([...vistos.values()].map(checkOne))
  return resultados.filter((r) => !r.ok)
}
