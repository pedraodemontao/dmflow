import type { FlowDefinition, FlowNode } from '@/lib/flow/types'

/**
 * Onde o fluxo perde gente em silêncio.
 *
 * Nasceu de um caso real (31/07/2026): a pessoa comentou a palavra-chave,
 * recebeu a DM, respondeu "Pode enviar" — e a condição só aceitava "SIM" ou
 * "quero". Caiu no `senão`, que levava a uma mensagem de despedida e ao `fim`.
 * O lead entrou, disse sim com as próprias palavras e saiu sem o material.
 * Nada falhou: nenhum erro, nenhum log, o `flow_run` marcado como concluído.
 *
 * Todo fluxo com condição tem um galho que termina. O construtor não avisava
 * qual, então o dono só descobria olhando conversa por conversa — e só quando
 * lembrava de olhar.
 *
 * Puro de propósito (mesmo padrão de `risk/assess.ts` e `day-trend.ts`): é
 * análise da definição, sem I/O, então roda igual no servidor ao salvar e no
 * navegador enquanto a pessoa monta o fluxo.
 */

export type LeakLevel = 'nota' | 'aviso' | 'erro'

export interface FlowLeak {
  nodeId: string
  level: LeakLevel
  /** Frase pronta em português, dizendo o que acontece e o que fazer. */
  message: string
}

/** Blocos que terminam a caminhada. Chegar num deles é sair do fluxo. */
function isTerminal(node: FlowNode | undefined): boolean {
  return !node || node.type === 'end' || node.type === 'unsubscribe'
}

/** Para onde cada bloco pode ir, com o rótulo do caminho quando há escolha. */
function exitsOf(node: FlowNode): Array<{ label: string | null; next: string | null }> {
  if (node.type === 'condition') {
    return [
      ...node.cases.map((branch) => ({
        label: `${branch.op === 'has_tag' ? 'tem etiqueta' : branch.value ?? ''}`,
        next: branch.next ?? null,
      })),
      { label: 'senão', next: node.fallback ?? null },
    ]
  }

  if (node.type === 'randomize') {
    return node.paths.map((path, index) => ({
      label: `caminho ${index + 1}`,
      next: path.next ?? null,
    }))
  }

  if ('next' in node) return [{ label: null, next: node.next ?? null }]
  return []
}

/** Todo bloco alcançável a partir da entrada. */
function reachable(definition: FlowDefinition): Set<string> {
  const seen = new Set<string>()
  const fila = [definition.entry]

  while (fila.length > 0) {
    const id = fila.pop()
    if (!id || seen.has(id)) continue
    seen.add(id)

    const node = definition.nodes[id]
    if (!node) continue
    for (const exit of exitsOf(node)) if (exit.next) fila.push(exit.next)
  }

  return seen
}

export function findLeaks(definition: FlowDefinition): FlowLeak[] {
  const leaks: FlowLeak[] = []
  const vivos = reachable(definition)

  for (const [id, node] of Object.entries(definition.nodes)) {
    if (!vivos.has(id)) {
      leaks.push({
        nodeId: id,
        level: 'aviso',
        message: 'Este bloco não é alcançável a partir do início — ninguém passa por ele.',
      })
      continue
    }

    const exits = exitsOf(node)

    // O caso real: condição lendo o que a PESSOA digitou, comparada a palavras
    // específicas, com o `senão` levando a um caminho que encerra a conversa.
    //
    // Texto livre quase nunca casa com palavra exata — "Pode enviar", "manda
    // aí", "quero sim pfv" não contêm "SIM". Então o `senão` não é o caso
    // raro, é o caminho MAIS provável; e se ele fecha a porta, o fluxo perde
    // justamente quem respondeu com as próprias palavras.
    //
    // Só avisa quando a condição lê `last_input`: condição sobre etiqueta ou
    // campo salvo compara valor que o próprio sistema escreveu, e aí casar é
    // previsível.
    if (node.type === 'condition') {
      const procurado = node.cases
        .filter((branch) => branch.source === 'last_input' && branch.value)
        .map((branch) => `"${branch.value}"`)

      if (procurado.length > 0) {
        leaks.push({
          nodeId: id,
          level: 'nota',
          message:
            `Quem não escrever ${procurado.join(' nem ')} cai no caminho "senão" — e a pessoa ` +
            `responde com as próprias palavras ("pode enviar", "manda aí"), então esse é o ` +
            `caminho mais provável, não a exceção. Confira se ele leva ao que ela pediu.`,
        })
      }
    }

    // Ponta solta: bloco que não é de fim e não aponta para lugar nenhum.
    for (const exit of exits) {
      if (exit.next === null && !isTerminal(node)) {
        leaks.push({
          nodeId: id,
          level: 'erro',
          message: exit.label
            ? `O caminho "${exit.label}" não leva a lugar nenhum — ligue-o a um bloco.`
            : 'Este bloco não aponta para nenhum outro — o fluxo para aqui sem bloco de fim.',
        })
      }

      if (exit.next && !definition.nodes[exit.next]) {
        leaks.push({
          nodeId: id,
          level: 'erro',
          message: `Aponta para um bloco que não existe mais ("${exit.next}").`,
        })
      }
    }
  }

  return leaks
}
