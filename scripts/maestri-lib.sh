#!/bin/bash
# Funções compartilhadas pelos scripts do Maestri. Carregue com `source`.

PROJ="${PROJ:-/Users/pedro/projects/dm-flow}"

# --------------------------------------------------------------------------
# Qual modelo em qual papel.
#
# O critério é CUSTO = tokens × preço, e os três papéis gastam tokens em
# ordens de grandeza diferentes:
#
#   implementador → lê código o dia inteiro. É onde o token queima, e onde
#                   trocar de modelo muda a conta de verdade.
#   revisor       → lê diff. Pouco token. Modelo fraco aqui não economiza
#                   quase nada e deixa passar bug — o pior negócio do time.
#   regente       → lê um quadro de vinte linhas. Token quase nenhum, então
#                   o modelo bom sai praticamente de graça.
#
# Por isso o caro fica no regente e o barato nos implementadores. Sobrescreva
# por variável de ambiente quando quiser testar outra combinação:
#
#   MODELO_IMPLEMENTADOR=opus bash scripts/maestri-setup.sh
# --------------------------------------------------------------------------
MODELO_REGENTE="${MODELO_REGENTE:-fable}"
MODELO_IMPLEMENTADOR="${MODELO_IMPLEMENTADOR:-sonnet}"
# Sonnet, não haiku: o revisor lê pouco, então o barato economiza centavos e
# custa o bug que ele deixaria passar. Se for para subir algum, suba este.
MODELO_REVISOR="${MODELO_REVISOR:-sonnet}"

maestri_bin() {
  local m
  m="$(command -v maestri || true)"
  [ -z "$m" ] && m="${MAESTRI_CLI:-}"
  echo "$m"
}

# Falha cedo e explica, em vez de despejar erro do CLI.
exigir_maestri() {
  if [ -z "$M" ] || ! "$M" list >/dev/null 2>&1; then
    echo "❌ O CLI do Maestri não respondeu."
    echo "   Este script só funciona dentro de um terminal aberto pela canvas do Maestri."
    exit 1
  fi
}

# Recruta, ou troca o modelo de quem já existe.
#
# `--replace` em vez de dismiss+recruit porque ele preserva o NÓ: posição na
# canvas, conexões com notas e as ligações com os outros agentes sobrevivem.
# Dismissar apaga o nó, e uma nota ligada só àquele recruta fica órfã — nada
# no CLI reconecta depois, só o arraste na interface.
#
# O que NÃO sobrevive: o histórico de conversa. O processo reinicia. Por isso
# o script sempre rebriefa depois de trocar.
#
#   recrutar <nome> <papel> <modelo> [args extras para a criação]
recrutar() {
  local nome="$1" papel="$2" modelo="$3"; shift 3

  if "$M" list 2>/dev/null | grep -q -- "$nome"; then
    echo "→ $nome já existe: trocando para o modelo $modelo (conexões preservadas)"
    "$M" recruit "$nome" --replace "$nome" \
      --command "claude --model $modelo" --role "$papel" \
      || echo "  (troca não aplicada, mantido como estava)"
  else
    echo "→ recrutando $nome com o modelo $modelo"
    "$M" recruit "$nome" --role "$papel" \
      --command "claude --model $modelo" --dir "$PROJ" "$@" \
      || echo "  (recruta já existia, mantido)"
  fi
}
