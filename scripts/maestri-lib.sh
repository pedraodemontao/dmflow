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
# TENTA O REPLACE PRIMEIRO, e só cria se ele falhar. A versão anterior fazia o
# contrário — perguntava a `maestri list` se o nome já existia — e isso duplicou
# o time em 01/08: agente que mora em OUTRO ANDAR não apareceu no list, o script
# concluiu que não existia, criou de novo, e o Maestri anexou " #2" ao nome. O
# resultado foi Estafeta e Sonar em dobro, com as cópias antigas rodando sem
# `--model`, ou seja, no modelo caro — exatamente o que a mudança queria evitar.
#
# Tentar a ação e olhar se deu certo é mais confiável que perguntar antes: a
# resposta do replace vem de quem realmente sabe, e não depende de o list
# enxergar aquele andar.
#
#   recrutar <nome> <papel> <modelo> [args extras para a criação]
recrutar() {
  local nome="$1" papel="$2" modelo="$3"; shift 3

  if "$M" recruit "$nome" --replace "$nome" \
       --command "claude --model $modelo" --role "$papel" >/dev/null 2>&1; then
    echo "→ $nome já existia: modelo trocado para $modelo (conexões preservadas)"
  else
    echo "→ recrutando $nome com o modelo $modelo"
    "$M" recruit "$nome" --role "$papel" \
      --command "claude --model $modelo" --dir "$PROJ" "$@" \
      || echo "  ⚠️  não consegui recrutar $nome — confira com: $M list"
  fi
}

# Aponta agente duplicado antes que ele queime modelo em silêncio.
#
# O Maestri anexa " #2" quando o nome colide, então a cópia é fácil de achar —
# e a cópia velha costuma ser a que está SEM `--model`, rodando no padrão caro.
avisar_duplicados() {
  local dups
  dups="$("$M" list 2>/dev/null | grep -oE '[A-Za-zÀ-ú]+ #[0-9]+' || true)"
  [ -z "$dups" ] && return 0
  echo
  echo "⚠️  AGENTE DUPLICADO na canvas:"
  echo "$dups" | sed 's/^/     /'
  echo "     A cópia sem --model roda no modelo padrão (caro). Confira o que ela tem"
  echo "     e, se estiver vazia, dispense a ANTIGA (a sem o #):"
  echo "         maestri check \"<nome>\"   # veja se há trabalho ali"
  echo "         maestri dismiss \"<nome>\" # apaga o nó de vez"
  echo "     Depois renomeie a #2 na interface, senão o ask vai para o nome errado."
}

# --------------------------------------------------------------------------
# O texto que TODO recruta do dm-flow recebe. Vivia dentro do maestri-setup.sh;
# saiu de lá em 29/08 quando o maestri-publicar.sh precisou do mesmo texto —
# dois scripts com a cópia cada um é a segunda verdade que diverge na primeira
# correção. Curto de propósito: aponta para os arquivos do repositório.
# --------------------------------------------------------------------------
base_role_text() {
  cat <<'EOF'
Projeto: dm-flow, automação de DM/comentário do Instagram (clone do núcleo do ManyChat), em produção em https://dm.nocodepedro.site, com uma conta real que já tomou restrição da Meta. Errar aqui custa um ativo, não um build quebrado.

ANTES DE QUALQUER COISA, leia nesta ordem:
  docs/maestri/00-contexto.md  — as regras que não se negociam
  CLAUDE.md                    — os invariantes, cada um com um incidente atrás
  HANDOFF.md                   — o que já quebrou e o que nunca foi provado
  AGENTS.md                    — este Next.js não é o que você conhece

As cinco que valem repetir aqui:
1. NUNCA rode `npm run dev`. O .env.local aponta para o banco de PRODUÇÃO; subir o servidor mexe em dado real e um tick manual dispara DM de verdade. Não existe staging.
2. Você ESCREVE migration, nunca aplica. Arquivo em supabase/migrations/ com o próximo número, e AVISE. Não há CLI nem psql: o dono cola no SQL Editor.
3. NÃO encoste em nada da Meta: developers.facebook.com, business.facebook.com, instagram.com. Automação de navegador em site da Meta foi o que causou a restrição de 30/07/2026.
4. NÃO enfraqueça a blindagem anti-spam: spintax em todo texto, jitter no evento de comentário, cap por hora que falha fechado. As três são invariantes.
5. Não commite segredo nem arquivo .env.

Valide com: npx tsc --noEmit && npm run lint && npm test && npm run build

Rode `maestri list` para ver seus colegas e com quem falar.
EOF
}

# Worktree por implementador, em branch própria, a partir da main.
#
# Por que worktree e não andar: a worktree não tem `.env.local` (gitignored),
# então o recruta não alcança o banco de PRODUÇÃO nem por engano — a regra 1
# do contexto deixa de depender da memória do agente. E funciona igual seja
# onde for que o workspace esteja registrado. Idempotente: pasta que já existe
# é mantida; branch que já existe é reaproveitada.
criar_worktree() {
  local dir="$1" branch="$2"
  if [ -d "$dir" ]; then
    echo "→ worktree já existe: $dir"
    return 0
  fi
  if git -C "$PROJ" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$PROJ" worktree add "$dir" "$branch" \
      && echo "→ worktree em $dir (branch $branch, já existia)"
  else
    git -C "$PROJ" worktree add -b "$branch" "$dir" main \
      && echo "→ worktree em $dir (branch $branch, nova, a partir da main)"
  fi
}

# Como `recrutar`, mas num diretório próprio (a worktree). Mesma lógica de
# tentar o replace primeiro — ver o comentário de `recrutar`.
#
#   recrutar_em <nome> <papel> <modelo> <dir>
recrutar_em() {
  local nome="$1" papel="$2" modelo="$3" dir="$4"

  if "$M" recruit "$nome" --replace "$nome" \
       --command "claude --model $modelo" --role "$papel" --dir "$dir" >/dev/null 2>&1; then
    echo "→ $nome já existia: modelo trocado para $modelo em $dir (conexões preservadas)"
  else
    echo "→ recrutando $nome com o modelo $modelo em $dir"
    "$M" recruit "$nome" --role "$papel" \
      --command "claude --model $modelo" --dir "$dir" \
      || echo "  ⚠️  não consegui recrutar $nome — confira com: $M list"
  fi
}
