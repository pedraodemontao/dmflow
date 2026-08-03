import type { FlowDefinition, FlowNode } from '@/lib/flow/types'

/**
 * Todo link que um fluxo entrega ao lead.
 *
 * POR QUE ISTO EXISTE: a automação `mapa` passou dias no ar mandando
 * `https://nocodepedro.site/mapa`, que devolve 404. Ninguém percebeu porque,
 * do ponto de vista do sistema, aquilo era sucesso — a DM saiu, o `flow_run`
 * concluiu, nenhum erro em lugar nenhum. O único sinal de que o funil estava
 * furado seria alguém reclamar.
 *
 * É o mesmo padrão de falha silenciosa que o resto do projeto combate em
 * outros lugares (o cap que falha fechado, o tick que responde 503, a análise
 * de vazamento do construtor): o que não falha alto não é visto.
 *
 * NÃO inclui o `http` node — aquele é webhook para n8n/CRM, não vai para o
 * lead, e um 404 ali é problema de integração, não de funil. Nem o `media`,
 * porque a Meta baixa o anexo no ato do envio: link de mídia quebrado já falha
 * alto, com erro no `flow_run`.
 */

export interface FlowLink {
  /** Bloco onde o link está — o aviso precisa levar ao lugar do problema. */
  nodeId: string
  url: string
  /** Rótulo do botão, quando veio de um. Ajuda a achar na tela. */
  label?: string
}

/** Links soltos no meio do texto: `Pega aqui: https://...`. */
const URL_NO_TEXTO = /https?:\/\/[^\s<>"')\]]+/g

function textosDe(node: FlowNode): string[] {
  const textos: string[] = []
  if ('text' in node && typeof node.text === 'string') textos.push(node.text)
  if ('caption' in node && typeof node.caption === 'string') textos.push(node.caption)
  return textos
}

/**
 * Extrai os links de um fluxo, sem tocar na rede.
 *
 * Puro de propósito: roda no servidor e no navegador, e é o que permite testar
 * a extração sem simular HTTP.
 */
export function extractLinks(definition: FlowDefinition): FlowLink[] {
  const links: FlowLink[] = []

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    // Botões: o caminho mais comum, e o do incidente do `mapa`.
    if ('buttons' in node && Array.isArray(node.buttons)) {
      for (const button of node.buttons) {
        if (button.url) links.push({ nodeId, url: button.url, label: button.title })
      }
    }

    // Cards de carrossel carregam botões próprios.
    if ('cards' in node && Array.isArray(node.cards)) {
      for (const card of node.cards) {
        for (const button of card.buttons ?? []) {
          if (button.url) links.push({ nodeId, url: button.url, label: button.title })
        }
      }
    }

    for (const texto of textosDe(node)) {
      for (const url of texto.match(URL_NO_TEXTO) ?? []) {
        links.push({ nodeId, url })
      }
    }
  }

  return links
}

/**
 * Link com variável ainda por interpolar não pode ser checado como está:
 * `https://site.com/x?c={{contact_id}}` só vira URL real no envio. Trocamos a
 * variável por um valor de teste em vez de pular o link — pular deixaria de
 * fora justamente o caso do `mapa`, que TINHA variável e ESTAVA quebrado.
 *
 * `{{presente}}` é a exceção: ele não tem forma canônica sem a entrega
 * vinculada, e a checagem dele é outra (a entrega existe? está publicada?),
 * feita por quem conhece o `delivery_id`.
 */
export function resolvableUrl(url: string): string | null {
  if (url.includes('{{presente}}')) return null
  return url.replace(/\{\{[^}]+\}\}/g, 'teste')
}
