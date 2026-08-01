#!/bin/bash
# Monta o time do dm-flow no Maestri: papéis, andares isolados e recrutas.
#
# Rode DE DENTRO de um terminal do Maestri, na raiz do projeto:
#   bash scripts/maestri-setup.sh
#
# Requer Maestro Mode ligado neste terminal (é o que libera criar andar).
# Use --no-brief para só montar o time, sem já mandar a primeira tarefa.
#
# Seguro para repetir: recruta que já existe tem o MODELO TROCADO no lugar,
# com as conexões preservadas — papel e andar que já existem apenas reclamam.
#
# Modelo por papel (o porquê está em maestri-lib.sh):
#   Regente        fable    — lê um quadro; token quase nenhum, modelo bom sai de graça
#   Implementador  sonnet   — lê código o dia inteiro; é aqui que a conta acontece
#   Revisor        sonnet   — lê diff; barato economiza centavos e custa bug
#
# Trocar sem editar o script:
#   MODELO_IMPLEMENTADOR=opus bash scripts/maestri-setup.sh
#
# HISTÓRICO: a versão anterior deste script montava um time para o carrossel e
# para o redesign da UI — os dois entregues em 31/07. Ela também mandava um
# agente rodar `npm run dev`, que hoje é proibido: o .env.local aponta para o
# banco de PRODUÇÃO e subir o servidor mexe em dado real.
set -uo pipefail

BRIEF=1
[ "${1:-}" = "--no-brief" ] && BRIEF=0

source "$(dirname "$0")/maestri-lib.sh"
M="$(maestri_bin)"
exigir_maestri

if ! "$M" floor list >/dev/null 2>&1; then
  echo "❌ Maestro Mode parece desligado neste terminal."
  echo "   Criar andar exige Maestro Mode. Ligue no nó deste terminal, na canvas,"
  echo "   e rode este script de novo."
  exit 1
fi

echo "=== time atual (não recrutar duplicado) ==="
"$M" list
echo

# --------------------------------------------------------------------------
# O que todo recruta precisa saber.
#
# Curto de propósito: aponta para os arquivos do repositório em vez de colar o
# texto inteiro aqui. O conteúdo fica versionado, e corrigir uma regra vira um
# commit — não um papel reescrito à mão que ninguém lembra de onde veio.
# --------------------------------------------------------------------------
BASE='Projeto: dm-flow, automação de DM/comentário do Instagram (clone do núcleo do ManyChat), em produção em https://dm.nocodepedro.site, com uma conta real que já tomou restrição da Meta. Errar aqui custa um ativo, não um build quebrado.

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

Rode `maestri list` para ver seus colegas e com quem falar.'

echo "=== criando papéis (o que já existir é mantido) ==="

"$M" role create "dmflow-entrega" "$BASE

SEU PAPEL: implementar o card docs/maestri/01-entrega.md — o presente passa a nascer junto do roteiro, publicado em página nossa, e a URL vira a variável que a automação dispara.
Escopo: src/lib/ai/, src/app/e/, src/app/(app)/biblioteca/, src/lib/flow/engine.ts (só a interpolação), src/proxy.ts (uma entrada em PUBLIC_PATHS) e supabase/migrations/0016_entregas.sql.
São CINCO fases. Uma por vez, com commit e parada para relatar entre elas. Nunca emende fases num commit só.
NÃO mexa em src/lib/webhook/ nem em src/lib/instagram/ — o polling é o que sustenta a produção, e nada neste card precisa dele." --scope current || echo "  (papel já existia, mantido)"

"$M" role create "dmflow-insights" "$BASE

SEU PAPEL: implementar o card docs/maestri/02-insights.md — métricas do post cruzadas com o funil que só nós temos.
Escopo: src/lib/instagram/, src/app/api/cron/tick/, src/app/(app)/automacoes/[id]/metricas/ e supabase/migrations/0017_insights_de_midia.sql.
A FASE 0 É DO DONO E BLOQUEIA TUDO: falta o escopo instagram_business_manage_insights no OAuth e uma reconexão da conta. Confirme com ele que a reconexão foi feita antes de começar a fase 2 — sem isso toda métrica responde \"Application does not have permission\" e você constrói no vazio.
NUNCA prometa curva de retenção segundo a segundo: ela não existe em API nenhuma da Meta, só no app. O que existe é tempo médio assistido, tempo total e taxa de pulo.
A coleta de métrica NÃO pode derrubar o tick: try/catch próprio, erro para console.error. O tick só responde 503 quando o POLLING falha, porque é o único aviso de que a automação parou." --scope current || echo "  (papel já existia, mantido)"

"$M" role create "dmflow-revisor" "$BASE

SEU PAPEL: você revisa e NUNCA edita arquivo. Sua saída é uma lista de achados, não um diff.
Formato, um por linha: arquivo:linha: severidade: problema. correção.
Procure, nesta ordem:
1. invariante do CLAUDE.md quebrado — envio sem passar pelo cap, texto automático sem spintax, algo que ignore a janela de 24h, claim otimista faltando, webhook que não responde 200
2. erro engolido — retorno do Supabase ignorado, catch vazio, erro que vai para um array em vez de subir (foi assim que um perfil inteiro ficou sem métrica por um dia)
3. valor derivado gravado em coluna bigint
4. rota nova em PUBLIC_PATHS sem defesa própria
5. teste que codifica o bug em vez de pegá-lo
6. texto de UI que mente sobre o estado do sistema
7. promessa que a API da Meta não pode cumprir
Sem elogio, sem sugestão de escopo novo. Diff bom: diga em uma linha e pare." --scope current || echo "  (papel já existia, mantido)"

echo
echo "=== criando andares isolados (clone git em branch própria) ==="
# Os dois cards tocam arquivos diferentes e podem correr em paralelo — mas na
# mesma árvore disputariam o git. O andar isolado é o que torna o paralelo real.
"$M" floor create "Entrega" --branch feat/entrega-do-presente || echo "  (andar já existia, mantido)"
"$M" floor create "Insights" --branch feat/insights-do-video || echo "  (andar já existia, mantido)"

echo
echo "=== recrutando (modelo barato em quem queima token) ==="
# --dir explícito: o workspace "DM FLOW" está registrado em /Users/pedro, não
# no projeto. Enquanto isso não for corrigido na interface, todo recruit precisa.
recrutar "Estafeta" "dmflow-entrega"  "$MODELO_IMPLEMENTADOR" --floor "Entrega"
recrutar "Sonar"    "dmflow-insights" "$MODELO_IMPLEMENTADOR" --floor "Insights"
recrutar "Peneira"  "dmflow-revisor"  "$MODELO_REVISOR"

"$M" connect "Estafeta" "Peneira" || true
"$M" connect "Sonar"    "Peneira" || true

if [ "$BRIEF" = "1" ]; then
  echo
  echo "=== aguardando os agentes subirem ==="
  sleep 10

  # O passo (1) não é formalidade: os cards são de 01/08/2026. Agente que começa
  # a codar sem conferir constrói em cima de suposição, e o erro só aparece no fim.
  echo "=== primeira tarefa (em paralelo) ==="
  "$M" ask --batch '{
    "Estafeta": "Leia docs/maestri/00-contexto.md e depois o seu card, docs/maestri/01-entrega.md. Antes de escrever qualquer código: (1) confira contra o repositório o que o card afirma — ele foi escrito em 01/08/2026 e pode estar velho; me diga o que não bater. (2) Me devolva o plano da FASE 1 em no máximo 10 linhas: arquivos que vai tocar, o que cada um passa a fazer, e o que pode quebrar. (3) Espere meu OK antes de começar. Não rode npm run dev e não aplique migration.",
    "Sonar": "Leia docs/maestri/00-contexto.md e depois o seu card, docs/maestri/02-insights.md. Antes de escrever qualquer código: (1) confira contra o repositório o que o card afirma e me diga o que não bater. (2) A FASE 0 é do dono e bloqueia o resto — confirme comigo se a reconexão do Instagram com o escopo de insights já foi feita. Se ainda não foi, a única coisa que você pode fazer agora é a fase 1 (o arquivo de migration) e a linha do escopo em src/lib/instagram/oauth.ts. (3) Me devolva esse plano em no máximo 10 linhas e espere meu OK. Não rode npm run dev e não aplique migration.",
    "Peneira": "Leia docs/maestri/00-contexto.md, CLAUDE.md e HANDOFF.md para carregar os invariantes. Depois revise os últimos commits (git log --oneline -8, git show em cada um) procurando o que está na sua lista de prioridades. Responda só com os achados no formato arquivo:linha: severidade: problema. correção. Se estiver tudo limpo, diga em uma linha."
  }'
fi

echo
avisar_duplicados

echo "✅ Time montado."
echo "   Estafeta → card 01, a entrega      · andar Entrega  · modelo $MODELO_IMPLEMENTADOR"
echo "   Sonar    → card 02, os insights    · andar Insights · modelo $MODELO_IMPLEMENTADOR"
echo "   Peneira  → revisor, não edita nada · andar térreo   · modelo $MODELO_REVISOR"
echo
echo "   Falta o Regente (modelo $MODELO_REGENTE):  bash scripts/maestri-orquestra.sh"
echo
echo "   Acompanhar:  maestri check \"Estafeta\""
echo "   Delegar:     maestri ask \"Sonar\" \"...\""
echo "   Integrar (só você): merge das branches, migration no SQL Editor e deploy."
echo
echo "   Notas na canvas (o CLI não cria): faça três, curtas, apontando para os"
echo "   arquivos — nota que copia o card vira uma segunda verdade que diverge"
echo "   na primeira correção."
