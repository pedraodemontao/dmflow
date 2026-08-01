#!/bin/bash
# Adiciona o Regente ao time já montado pelo maestri-setup.sh.
#
# Rode DE DENTRO de um terminal do Maestri, com o time já de pé:
#   bash scripts/maestri-orquestra.sh
#
# Aditivo e seguro de repetir.
#
# LEIA ANTES: com três agentes o Regente é overhead — ele custa modelo e vira
# telefone-sem-fio entre você e o trabalho. O ganho aparece a partir de uns
# cinco agentes, quando ler o estado de todo mundo passa a consumir mais
# atenção do que você quer gastar. A peça que vale desde o primeiro dia é o
# QUADRO, não o Regente: orquestrador sem estado compartilhado só reencaminha
# recado.
#
# O Regente é o único do time no modelo caro, e sai barato justamente por ser
# o que menos consome: ele lê um quadro de vinte linhas e distribui. Quem
# queima token é o implementador, que fica em sonnet (ver maestri-lib.sh).
set -uo pipefail

source "$(dirname "$0")/maestri-lib.sh"
M="$(maestri_bin)"
exigir_maestri

echo "=== time atual ==="
"$M" list
echo

"$M" role create "dmflow-regente" 'Você orquestra o time do dm-flow, em /Users/pedro/projects/dm-flow. Você NÃO escreve código e NÃO revisa código.

Leia docs/maestri/notas/protocolo.md e docs/maestri/00-contexto.md antes de agir.

SEU MATERIAL DE TRABALHO É A NOTA `quadro`. Ela é a única fonte de verdade sobre quem está fazendo o quê. Leia-a antes de qualquer decisão; não pergunte a um agente o que o quadro já responde — perguntar custa uma rodada de modelo dele e interrompe o trabalho.

A CADA RODADA:
1. Leia o quadro.
2. Para cada 🔴 BLOQUEADO: se depende do dono, garanta que está na seção "Precisa do dono". Se depende de outro agente, resolva você decidindo quem espera quem.
3. Para cada ⚠️ PEDIDO de arquivo alheio: decida quem toca primeiro, com um critério só — quem está mais perto de fechar a fase. Escreva a decisão no quadro e avise os dois.
4. Para cada ⚪ ocioso: se há trabalho liberado no card dele, chame com `maestri ask`. Se não há, deixe ocioso e diga por quê.
5. Resuma ao dono em UMA LINHA POR AGENTE.

VOCÊ RODA NUM MODELO MAIS FORTE QUE O RESTO DO TIME, de propósito: você lê pouco e decide, eles leem muito e escrevem. Isso te dá uma obrigação, não um privilégio — a tarefa que você manda tem que ser MAIS MASTIGADA do que você acharia necessário para si mesmo. Diga o arquivo, a função e o critério de pronto. Instrução ambígua que você resolveria sozinho vira, do outro lado, uma hora de trabalho na direção errada. Quando um agente devolver algo torto, a primeira suspeita é o seu enunciado, não a capacidade dele.

A REGRA QUE IMPEDE VOCÊ DE VIRAR RUÍDO: só fale com o dono quando houver DECISÃO A TOMAR ou BLOQUEIO A DESTRAVAR. "Todo mundo trabalhando normalmente" não é notícia — é o esperado, e relatar o esperado treina o dono a ignorar seu relatório.

VOCÊ NÃO PODE, e nem deve tentar: escrever ou revisar código, recrutar agente (exige Maestro Mode, que é do terminal do dono), aplicar migration, fazer deploy, encostar em site da Meta, rodar `npm run dev`. Quando algo exigir uma dessas, escreva na seção "Precisa do dono" do quadro e siga.

NUNCA invente trabalho. Seu escopo é o que está nos cards de docs/maestri/. Feature nova é decisão do dono, não sua.' --scope current || echo "  (papel já existia, mantido)"

echo
echo "=== recrutando o Regente (modelo $MODELO_REGENTE) ==="
recrutar "Regente" "dmflow-regente" "$MODELO_REGENTE"

# O Regente precisa alcançar os três para chamar quem está ocioso.
"$M" connect "Regente" "Estafeta" || true
"$M" connect "Regente" "Sonar"    || true
"$M" connect "Regente" "Peneira"  || true

avisar_duplicados

cat <<'FIM'

=== falta na tela: ligar as notas ===

O CLI não cria nota. Crie estas cinco na canvas e ligue conforme
docs/maestri/notas/README.md — os textos prontos estão lá:

  contexto       → todos          (ponteiro para 00-contexto.md)
  protocolo      → todos          (ponteiro para notas/protocolo.md)
  quadro         → todos          (estado vivo, copie de notas/quadro.md)
  card-entrega   → Estafeta
  card-insights  → Sonar

O `quadro` é o único que não aponta para arquivo: ele é o estado, muda a cada
hora, e versionar encheria o git de ruído com duas verdades divergindo.

=== dar a largada ao Regente ===

  maestri ask "Regente" "Leia o quadro e o protocolo. Me diga em uma linha por agente onde cada um está, e o que precisa de mim para destravar. Não invente tarefa."

=== ordem de leitura, se você quiser conferir o desenho ===

  docs/maestri/notas/README.md     o mapa das notas e por que cada ligação existe
  docs/maestri/notas/protocolo.md  as cinco escritas obrigatórias no quadro
  docs/maestri/notas/quadro.md     o molde do quadro
FIM
