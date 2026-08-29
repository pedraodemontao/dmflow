#!/bin/bash
# Monta no Maestri o time dos cards 04 (publicar) e 05 (criar carrossel).
#
# Rode DE DENTRO de um terminal do Maestri, na raiz do projeto, com Maestro Mode:
#   bash scripts/maestri-publicar.sh
#
# Aditivo ao maestri-setup.sh: reaproveita o papel `dmflow-revisor` e a Peneira
# se existirem, e não encosta em Estafeta nem Sonar. Seguro de repetir — recruta
# que já existe tem o modelo trocado no lugar, com as conexões preservadas.
# Use --no-brief para só montar o time, sem mandar a primeira tarefa.
#
# ISOLAMENTO POR WORKTREE, NÃO POR ANDAR. O maestri-setup.sh criou andares e
# mesmo assim passou `--dir` apontando para a árvore principal (o workspace
# está registrado em /Users/pedro, e sem `--dir` o recruta nascia fora do
# projeto) — ou seja, os dois implementadores dividiam a mesma árvore. Aqui
# cada recruta ganha um `git worktree` próprio, em branch própria:
#
#   1. funciona igual independente de onde o workspace está registrado;
#   2. a worktree NÃO tem `.env.local` (é gitignored) — o recruta não alcança o
#      banco de PRODUÇÃO nem por engano, que é a regra 1 do contexto sem
#      depender de o agente lembrar dela;
#   3. `next build` passa sem `.env` (env e supabaseAdmin são Proxies lazy) e
#      os testes simulam Supabase e Instagram, então os quatro comandos rodam.
#
# O preço: `npm ci` em cada worktree (a primeira tarefa já pede), e o merge é
# do dono, na árvore principal.
#
# Modelo por papel: ver maestri-lib.sh. Trocar sem editar:
#   MODELO_IMPLEMENTADOR=opus bash scripts/maestri-publicar.sh
set -uo pipefail

BRIEF=1
[ "${1:-}" = "--no-brief" ] && BRIEF=0

source "$(dirname "$0")/maestri-lib.sh"
M="$(maestri_bin)"
exigir_maestri

DIR_PUBLICAR="${DIR_PUBLICAR:-$PROJ/../dm-flow-publicar}"
DIR_CRIAR="${DIR_CRIAR:-$PROJ/../dm-flow-criar}"
BRANCH_PUBLICAR="feat/publicar-no-instagram"
BRANCH_CRIAR="feat/criar-carrossel"

echo "=== time atual (não recrutar duplicado) ==="
"$M" list
echo

if ! "$M" role list 2>/dev/null | grep -q "dmflow-revisor"; then
  echo "❌ O papel dmflow-revisor não existe. Rode antes:"
  echo "     bash scripts/maestri-setup.sh --no-brief"
  echo "   Ele cria o revisor que este time reaproveita."
  exit 1
fi

echo "=== worktrees (uma por implementador, sem .env.local) ==="
criar_worktree "$DIR_PUBLICAR" "$BRANCH_PUBLICAR"
criar_worktree "$DIR_CRIAR"    "$BRANCH_CRIAR"
echo

BASE="$(base_role_text)"

echo "=== criando papéis (o que já existir é mantido) ==="

"$M" role create "dmflow-publicar" "$BASE

SEU PAPEL: implementar o card docs/maestri/04-publicar.md — o post nasce dentro do painel, o tick publica com claim, cap e jitter, e o gatilho da automação escolhida é clonado para o post novo.
Você trabalha numa worktree própria, sem .env.local de propósito: o banco de produção fica fora do seu alcance. Rode \`npm ci\` antes de qualquer coisa.
Escopo: src/lib/instagram/oauth.ts (uma linha de escopo), src/lib/instagram/publish.ts, src/lib/publications/, src/app/api/cron/tick/route.ts (só a chamada), src/app/(app)/publicacoes/ EXCETO a pasta gerar/, src/components/layout/top-nav.tsx (uma entrada), src/lib/env.ts, src/types/db.ts e supabase/migrations/0021_publicacoes.sql.
São CINCO fases. A fase 0 é do dono (reconexão com escopo novo) e bloqueia a fase 2 em diante — a fase 1 (migration) não depende dela. Uma fase por vez, com commit e parada para relatar. Nunca emende fases num commit só.
Ao fim de cada fase: \`maestri ask \"Peneira\" \"revisa o diff da fase N do card 04: git show <sha>\"\` e trate os achados antes de seguir.
NÃO chame a Meta de dentro de server action — só o tick publica. NÃO mexa em src/lib/webhook/. NÃO toque em src/app/(app)/publicacoes/gerar/ — é da Forja." --scope current || echo "  (papel já existia, mantido)"

"$M" role create "dmflow-criar" "$BASE

SEU PAPEL: implementar o card docs/maestri/05-criar.md — o carrossel nasce do roteiro por IA, é renderizado em JPEG pelo servidor (next/og + sharp) e vira rascunho em publications para o card 04 publicar.
Você trabalha numa worktree própria, sem .env.local de propósito: o banco de produção fica fora do seu alcance. Rode \`npm ci\` antes de qualquer coisa.
Escopo: src/lib/ai/schemas.ts (schema novo, sem tocar no do roteiro), src/lib/ai/generate-carousel.ts, src/lib/ai/anthropic.ts (uma entrada em MODEL_BY_TASK e MAX_TOKENS_BY_TASK), src/lib/render/, scripts/render-preview.mts, src/app/(app)/publicacoes/gerar/ e supabase/migrations/0022_roteiro_tem_tipo.sql. Um link em src/app/(app)/biblioteca/roteiros/page.tsx e no card do item da biblioteca — declare no quadro antes.
São TRÊS fases. As fases 1 e 2 são puras e você começa por elas. A fase 3 importa createPublication do card 04 e SÓ começa quando o quadro disser 'card 04 fase 4 — FECHADA' e a branch estiver na main — até lá, não toque em nada de src/app/(app)/publicacoes/ fora de gerar/.
Ao fim de cada fase: \`maestri ask \"Peneira\" \"revisa o diff da fase N do card 05: git show <sha>\"\` e trate os achados antes de seguir.
NÃO instale AI SDK, skia-canvas, canvas, playwright ou puppeteer. NÃO chame a Meta — publicar é o card 04. NÃO use runtime edge." --scope current || echo "  (papel já existia, mantido)"

echo
echo "=== recrutando (modelo barato em quem queima token) ==="
recrutar_em "Prelo" "dmflow-publicar" "$MODELO_IMPLEMENTADOR" "$DIR_PUBLICAR"
recrutar_em "Forja" "dmflow-criar"    "$MODELO_IMPLEMENTADOR" "$DIR_CRIAR"
# A Peneira do setup revisa os dois cards novos também. Se não existir, nasce
# aqui com o papel que o setup criou.
recrutar "Peneira" "dmflow-revisor" "$MODELO_REVISOR"

"$M" connect "Prelo" "Peneira" || true
"$M" connect "Forja" "Peneira" || true
# Os dois se falam pelo quadro; a ligação direta é para o ⚠️ PEDIDO de arquivo.
"$M" connect "Prelo" "Forja" || true

echo
echo "=== notas: ponteiros para os cards (o CLI cria e liga desde 29/08) ==="
# Ponteiro, não cópia: nota que repete o card vira uma segunda verdade que
# diverge na primeira correção (docs/maestri/notas/README.md).
"$M" note create "card-publicar
Seu card é docs/maestri/04-publicar.md. Cinco fases, uma por vez.
A fase 0 é do dono e bloqueia a fase 2 em diante: confirme no quadro que a
reconexão com instagram_business_content_publish foi feita antes de codar publish.ts." \
  && "$M" connect "card-publicar" "Prelo" || echo "  ⚠️  não liguei card-publicar ao Prelo — ligue na canvas"

"$M" note create "card-criar
Seu card é docs/maestri/05-criar.md. Três fases.
Fases 1 e 2 agora; a fase 3 só quando o quadro disser 'card 04 fase 4 — FECHADA'." \
  && "$M" connect "card-criar" "Forja" || echo "  ⚠️  não liguei card-criar à Forja — ligue na canvas"

# As três notas do time (contexto, protocolo, quadro) precisam chegar aos novos.
# O nome de nota deriva da primeira linha e pode ter sido renomeado; tenta os
# dois nomes e avisa se nenhum pegar — ligar na canvas é um arraste.
ligar_nota() {
  local recruta="$1"; shift
  for nome in "$@"; do
    "$M" connect "$nome" "$recruta" >/dev/null 2>&1 && return 0
  done
  echo "  ⚠️  não achei a nota ($*) para ligar a $recruta — ligue na canvas"
}
for r in Prelo Forja; do
  ligar_nota "$r" "contexto" "CONTEXTO — leia antes de qualquer card"
  ligar_nota "$r" "protocolo" "PROTOCOLO — como o time se coordena"
  ligar_nota "$r" "quadro" "QUADRO — estado vivo do time"
done

echo
echo "=== quadro: o que passa a depender do dono ==="
PENDENCIAS='### Cards 04 e 05 (29/08)
- [ ] reconectar o Instagram com o escopo instagram_business_content_publish
      (a MESMA reconexão resolve a pendência do card 02)
- [ ] criar o bucket PÚBLICO `publication-media` no dashboard do Supabase
- [ ] migration 0021_publicacoes.sql — colar no SQL Editor quando o Prelo avisar
- [ ] migration 0022_roteiro_tem_tipo.sql — idem, quando a Forja avisar

## Fechado'
if ! { "$M" note edit "quadro" "## Fechado" "$PENDENCIAS" \
    || "$M" note edit "QUADRO — estado vivo do time" "## Fechado" "$PENDENCIAS"; } >/dev/null 2>&1; then
  echo "  ⚠️  não consegui escrever no quadro. Cole em 'Precisa do dono':"
  echo "$PENDENCIAS" | sed '$d' | sed 's/^/     /'
fi

if [ "$BRIEF" = "1" ]; then
  echo
  echo "=== aguardando os agentes subirem ==="
  sleep 10

  # O passo (1) não é formalidade: os cards são de 29/08/2026. Agente que começa
  # a codar sem conferir constrói em cima de suposição, e o erro só aparece no fim.
  echo "=== primeira tarefa (em paralelo) ==="
  "$M" ask --batch "{
    \"Prelo\": \"Você está numa worktree ($DIR_PUBLICAR, branch $BRANCH_PUBLICAR), sem .env.local de propósito. Primeiro: npm ci. Depois leia docs/maestri/00-contexto.md, docs/maestri/notas/protocolo.md e o seu card, docs/maestri/04-publicar.md. Antes de escrever qualquer código: (1) confira contra o repositório o que o card afirma — foi escrito em 29/08/2026; me diga o que não bater. (2) A fase 0 é do dono: faça só a linha do escopo em oauth.ts e escreva no quadro que a reconexão é dele. (3) Devolva o plano da FASE 1 em no máximo 10 linhas: arquivos, o que cada um passa a fazer, o que pode quebrar. (4) Espere meu OK. Não rode npm run dev, não aplique migration, não crie bucket.\",
    \"Forja\": \"Você está numa worktree ($DIR_CRIAR, branch $BRANCH_CRIAR), sem .env.local de propósito. Primeiro: npm ci. Depois leia docs/maestri/00-contexto.md, docs/maestri/notas/protocolo.md e o seu card, docs/maestri/05-criar.md. Antes de escrever qualquer código: (1) confira contra o repositório o que o card afirma — foi escrito em 29/08/2026; me diga o que não bater. (2) Leia docs/marca/quantia-manual.md e me diga qual fonte o render vai usar e se a licença permite embutir o TTF. (3) Devolva o plano da FASE 1 em no máximo 10 linhas e espere meu OK. A fase 3 espera o card 04 — não toque em src/app/(app)/publicacoes/ fora de gerar/. Não rode npm run dev, não aplique migration.\",
    \"Peneira\": \"Dois cards novos: docs/maestri/04-publicar.md e docs/maestri/05-criar.md. Antes de revisar código, revise OS CARDS contra o repositório de hoje: afirmação que não bate com o código, arquivo ou linha que não existe, chamada da API da Meta prometida sem evidência, invariante do CLAUDE.md que o card manda quebrar. Formato: arquivo:linha: severidade: problema. correção. Se estiverem certos, diga em uma linha.\"
  }"
fi

echo
avisar_duplicados

echo "✅ Time montado."
echo "   Prelo   → card 04, publicar     · $DIR_PUBLICAR · modelo $MODELO_IMPLEMENTADOR"
echo "   Forja   → card 05, criar        · $DIR_CRIAR · modelo $MODELO_IMPLEMENTADOR"
echo "   Peneira → revisor, não edita    · árvore principal · modelo $MODELO_REVISOR"
echo
echo "   Acompanhar:  maestri check \"Prelo\""
echo "   Delegar:     maestri ask \"Forja\" \"...\""
echo "   Integrar (só você): merge das branches na main, migrations 0021/0022 no"
echo "   SQL Editor, bucket publication-media, reconexão do Instagram, deploy."
echo "   Ordem de merge: 04 antes de 05 — a fase 3 da Forja importa do Prelo."
