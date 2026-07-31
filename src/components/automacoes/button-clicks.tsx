import { Card } from '@/components/ui'
import { RankBars, type RankItem } from '@/components/ui/chart'
import { listButtonNodes } from '@/lib/flow/button-source'
import type { NodeButtonClicks } from '@/lib/data'
import type { FlowDefinition } from '@/lib/flow/types'

/**
 * Qual botão a pessoa apertou, bloco por bloco.
 *
 * O funil acima diz que ela PASSOU pelo bloco de botões; esta seção diz o que
 * ela ESCOLHEU ali. É a diferença entre "40 pessoas viram a pergunta" e "38
 * pediram o mapa e 2 disseram depois eu vejo" — a segunda é a que muda o
 * próximo post.
 *
 * A repartição é sempre dentro do bloco, nunca entre blocos: `RankBars` mede a
 * barra contra o maior item da lista que recebe, então uma lista por bloco faz
 * cada barra significar "fatia desta escolha", que é a leitura certa. Uma
 * lista só com todos os botões do fluxo compararia opções que nunca
 * disputaram entre si.
 *
 * Os botões vêm da DEFINIÇÃO, não dos cliques — é o que faz o botão com zero
 * clique aparecer. "Ninguém escolheu esta opção" é dado, e um botão que só
 * existe quando alguém aperta esconderia justamente o fracasso.
 */

const NODE_LABEL: Record<string, string> = {
  buttons: 'Botões',
  message: 'Mensagem',
  carousel: 'Carrossel',
}

export function ButtonClicks({
  groups,
  definition,
}: {
  groups: NodeButtonClicks[]
  /** Nulo quando a definição salva não passa mais no schema. */
  definition: FlowDefinition | null
}) {
  const declared = definition ? listButtonNodes(definition) : []
  const clicksByNode = new Map(groups.map((group) => [group.nodeId, group]))

  const sections = declared.map((node) => {
    const group = clicksByNode.get(node.nodeId)
    const byPayload = new Map((group?.choices ?? []).map((choice) => [choice.payload, choice]))

    const total = group?.clicks ?? 0
    const best = Math.max(0, ...node.buttons.map((b) => byPayload.get(b.payload)?.clicks ?? 0))
    // Limão só no mais apertado de cada bloco, e só quando houve disputa de
    // verdade: bloco com um botão só, ou onde todo mundo tirou zero, não tem
    // vencedor — marcar um seria decoração, não informação.
    const hasWinner = best > 0 && node.buttons.length > 1

    const items: RankItem[] = node.buttons.map((button) => {
      const choice = byPayload.get(button.payload)
      const clicks = choice?.clicks ?? 0
      const share = total > 0 ? Math.round((clicks / total) * 100) : 0

      return {
        id: `${node.nodeId}:${button.payload}`,
        value: clicks,
        valueLabel: clicks,
        tone: hasWinner && clicks === best ? 'accent' : 'ink',
        label: (
          <span className="flex items-baseline gap-2">
            <span className="truncate">{button.title}</span>
            {total > 0 && (
              <span className="label shrink-0 text-[9px] text-muted tabular-nums">{share}%</span>
            )}
            <span className="label shrink-0 truncate text-[9px] text-muted">{button.payload}</span>
          </span>
        ),
      }
    })

    // Botão apagado do fluxo depois que alguém já tinha apertado: a contagem é
    // real e some da definição, então entra no fim marcada como fora do bloco.
    const removed: RankItem[] = (group?.choices ?? [])
      .filter((choice) => !node.buttons.some((button) => button.payload === choice.payload))
      .map((choice) => ({
        id: `${node.nodeId}:removido:${choice.payload}`,
        value: choice.clicks,
        valueLabel: choice.clicks,
        tone: 'ink' as const,
        label: (
          <span className="flex items-baseline gap-2">
            <span className="truncate">{choice.title ?? choice.payload}</span>
            <span className="label shrink-0 text-[9px] text-muted">botão removido</span>
          </span>
        ),
      }))

    return { node, total, items: [...items, ...removed] }
  })

  // Cliques cuja origem ficou ambígua ou cujo bloco sumiu do fluxo: não cabem
  // em nenhuma seção acima, mas a contagem existe e escondê-la faria a soma
  // desta tela não bater com a realidade.
  const orphan = groups.filter(
    (group) => !declared.some((node) => node.nodeId === group.nodeId),
  )

  // Automação sem bloco de botões não tem esta pergunta — nem seção vazia,
  // nem card dizendo que não há nada. Simplesmente não aparece.
  if (sections.length === 0 && orphan.length === 0) return null

  const totalClicks =
    sections.reduce((sum, section) => sum + section.total, 0) +
    orphan.reduce((sum, group) => sum + group.clicks, 0)

  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-4 border-b border-border p-4">
        <div className="min-w-0">
          <p className="label text-[10px] text-muted">Escolha por botão</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {totalClicks > 0
              ? 'Qual opção a pessoa apertou em cada bloco. A barra compara os botões do mesmo bloco entre si.'
              : 'Nenhum botão foi apertado ainda. Assim que alguém escolher, a repartição aparece aqui.'}
          </p>
        </div>
        <p className="label shrink-0 text-[9px] text-muted">cliques</p>
      </div>

      {sections.map((section) => (
        <section key={section.node.nodeId} className="border-b border-border last:border-b-0">
          <div className="flex items-baseline gap-2 px-4 pt-4">
            <span className="text-xs text-foreground">
              {NODE_LABEL[section.node.nodeType] ?? section.node.nodeType}
            </span>
            <span className="label truncate text-[9px] text-muted">{section.node.nodeId}</span>
            <span className="label ml-auto shrink-0 text-[9px] text-muted tabular-nums">
              {section.total} {section.total === 1 ? 'clique' : 'cliques'}
            </span>
          </div>

          <RankBars className="px-4" items={section.items} />
        </section>
      ))}

      {orphan.map((group) => (
        <section key={group.nodeId ?? 'ambiguo'} className="border-b border-border last:border-b-0">
          <div className="flex items-baseline gap-2 px-4 pt-4">
            <span className="text-xs text-foreground">
              {!group.nodeId
                ? 'Origem ambígua'
                : definition
                  ? 'Bloco removido do fluxo'
                  : 'Bloco'}
            </span>
            {group.nodeId && (
              <span className="label truncate text-[9px] text-muted">{group.nodeId}</span>
            )}
            <span className="label ml-auto shrink-0 text-[9px] text-muted tabular-nums">
              {group.clicks} {group.clicks === 1 ? 'clique' : 'cliques'}
            </span>
          </div>

          <RankBars
            className="px-4"
            items={group.choices.map((choice) => ({
              id: `${group.nodeId ?? 'ambiguo'}:${choice.payload}`,
              value: choice.clicks,
              valueLabel: choice.clicks,
              tone: 'ink' as const,
              label: (
                <span className="flex items-baseline gap-2">
                  <span className="truncate">{choice.title ?? choice.payload}</span>
                  <span className="label shrink-0 truncate text-[9px] text-muted">
                    {choice.payload}
                  </span>
                </span>
              ),
            }))}
          />
        </section>
      ))}

      {orphan.some((group) => group.nodeId === null) && (
        <p className="border-t border-border p-4 text-xs leading-relaxed text-muted">
          “Origem ambígua” é o mesmo payload declarado em mais de um bloco: o clique é real, mas
          não dá para saber de qual deles veio. Payload único por botão resolve.
        </p>
      )}
    </Card>
  )
}
