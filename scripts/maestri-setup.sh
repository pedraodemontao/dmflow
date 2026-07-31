#!/bin/bash
# Monta o time do dm-flow no Maestri: papéis, andares isolados e recrutas.
#
# Rode DE DENTRO de um terminal do Maestri, na raiz do projeto:
#   bash scripts/maestri-setup.sh
#
# Requer Maestro Mode ligado neste terminal (é o que libera criar andar).
# Use --no-brief para só montar o time, sem já mandar a primeira tarefa.
set -uo pipefail

BRIEF=1
[ "${1:-}" = "--no-brief" ] && BRIEF=0

M="$(command -v maestri || true)"
[ -z "$M" ] && M="${MAESTRI_CLI:-}"
if [ -z "$M" ] || ! "$M" list >/dev/null 2>&1; then
  echo "❌ O CLI do Maestri não respondeu."
  echo "   Este script só funciona dentro de um terminal aberto pela canvas do Maestri."
  exit 1
fi

echo "=== time atual (não recrutar duplicado) ==="
"$M" list
echo

# --------------------------------------------------------------------------
# Regras que todo recruta precisa saber. O projeto manda DM real de uma conta
# do Instagram que tomou restrição da Meta em 2026-07-30 — errar aqui custa
# um ativo, não um build quebrado.
# --------------------------------------------------------------------------
BASE='Projeto: dm-flow, automação de DM/comentário do Instagram (clone do núcleo do ManyChat), em produção em https://dm.nocodepedro.site.

ANTES DE QUALQUER COISA, leia nesta ordem: CLAUDE.md (invariantes que não podem ser quebradas), AGENTS.md, ROADMAP.md (o que falta e em que ordem) e HANDOFF.md (estado atual). Não comece a escrever código antes disso.

REGRAS INVIOLÁVEIS DESTE TIME:
1. NÃO rode migration no Supabase e NÃO faça deploy na Vercel. Existe UM integrador que faz isso. Se sua mudança precisa de migration, escreva o arquivo em supabase/migrations/ com o próximo número e AVISE — não execute.
2. NÃO encoste em nada da Meta: não abra developers.facebook.com, não teste envio real de DM, não mexa em token nem em webhook. A conta tomou restrição em 30/07/2026 por atividade automatizada. Automação de navegador em site da Meta é proibida.
3. Fique nos SEUS arquivos (listados no seu papel). Outro agente está mexendo em outra parte do código ao mesmo tempo. Se precisar tocar em arquivo fora do seu escopo, avise em vez de editar.
4. Antes de dizer que terminou: npx tsc --noEmit && npm run lint && npm run build — os três limpos.
5. Código e nomes em inglês, textos de UI em português. Arquivos em kebab-case. Nunca commite segredo nem arquivo .env.

Rode `maestri list` para ver seus colegas e com quem falar.'

echo "=== criando papéis ==="

"$M" role create "dmflow-motor" "$BASE

SEU PAPEL: você constrói os blocos que faltam no builder de fluxo.
Escopo: src/lib/flow/ (types.ts, engine.ts, transform.ts), src/components/automacoes/ (flow-nodes.tsx, node-inspector.tsx, flow-builder.tsx) e src/lib/instagram/api.ts.
Tarefas, na ordem do ROADMAP: carrossel de cards, bloco de vídeo/áudio, e bloco \"pular para outro fluxo\".
Para adicionar um bloco novo é preciso mexer em SEIS lugares — schema Zod em types.ts, execução no engine.ts, blankNode em transform.ts, NODE_META e preview em flow-nodes.tsx, PALETTE em flow-builder.tsx e a UI de edição em node-inspector.tsx. Esquecer um deles quebra em silêncio.
NÃO mexa em src/app/(app)/ nem em src/components/ui/ — são de outro agente." --scope current

"$M" role create "dmflow-ui" "$BASE

SEU PAPEL: você redesenha a interface do painel, sem mudar comportamento.
Escopo: src/components/ui/index.tsx, src/app/globals.css, src/components/layout/, e o CSS das páginas em src/app/(app)/.
Objetivo: identidade visual própria, que não pareça o ManyChat. Trabalhe densidade, hierarquia, tipografia, estados de foco e acessibilidade. Mantenha o tema escuro atual como base.
NÃO altere lógica: nada de mexer em server actions, em src/lib/ ou no que os componentes fazem — só em como se parecem. Se um ajuste visual exigir mudar comportamento, avise em vez de fazer.
Preserve os nomes dos componentes exportados (Button, Card, Input, Label, Select, Textarea, Badge, EmptyState): o resto do app depende deles." --scope current

"$M" role create "dmflow-revisor" "$BASE

SEU PAPEL: você revisa e NUNCA edita arquivo. Sua saída é uma lista de achados, não um diff.
Revise o que os outros agentes produzirem, com foco em: correção (o código faz o que diz?), as invariantes do CLAUDE.md, risco de flag da Meta (texto repetido, envio sem jitter, envio sem passar pelo cap de envios/hora), vazamento de segredo, e regressão no motor de fluxo.
Preste atenção especial em: envio de mensagem sem assertUnderSendCap/logSend, resposta automática sem variação de texto (spintax), qualquer coisa que ignore a janela de 24h, e migration que rode fora de ordem.
Para cada achado escreva: arquivo:linha, o problema em uma frase, e o cenário concreto em que quebra. Sem elogio, sem sugestão de escopo novo." --scope current

echo
echo "=== criando andares isolados (clone git em branch própria) ==="
"$M" floor create "Motor" --branch feat/blocos-fluxo
"$M" floor create "Interface" --branch feat/redesign-ui

echo
echo "=== recrutando ==="
"$M" recruit "Bigorna" --role "dmflow-motor" --floor "Motor"
"$M" recruit "Prisma" --role "dmflow-ui" --floor "Interface"
"$M" recruit "Argos" --role "dmflow-revisor"

if [ "$BRIEF" = "1" ]; then
  echo
  echo "=== aguardando os agentes subirem ==="
  sleep 10

  echo "=== primeira tarefa (em paralelo) ==="
  "$M" ask --batch '{
    "Bigorna": "Leia CLAUDE.md, AGENTS.md e ROADMAP.md. Depois implemente o bloco de CARROSSEL de cards (generic template do Instagram, máximo 10 cards, cada um com título, subtítulo, imagem e até 3 botões). Lembre dos seis lugares que precisam ser tocados. Ao terminar, rode npx tsc --noEmit && npm run lint && npm run build e me diga o resultado. Não faça deploy nem rode migration.",
    "Prisma": "Leia CLAUDE.md e ROADMAP.md, depois rode npm run dev e navegue pelo painel para entender a interface atual. Proponha e implemente uma identidade visual própria começando por src/components/ui/index.tsx e src/app/globals.css: escala tipográfica, espaçamento, cores e estados de foco. Não mude comportamento nem os nomes dos componentes exportados. Valide com npx tsc --noEmit && npm run lint && npm run build.",
    "Argos": "Leia CLAUDE.md, ROADMAP.md e HANDOFF.md para entender as invariantes. Depois revise os commits de hoje (git log --oneline -12 e git show de cada um) procurando: envio de mensagem que escape do cap de envios/hora, texto automático sem spintax, qualquer coisa que ignore a janela de 24h, e segredo commitado. Responda só com a lista de achados no formato arquivo:linha + problema + como quebra."
  }'
fi

echo
echo "✅ Time montado."
echo "   Bigorna  → blocos do fluxo, andar Motor (branch feat/blocos-fluxo)"
echo "   Prisma   → redesign da UI, andar Interface (branch feat/redesign-ui)"
echo "   Argos    → revisor, sem editar arquivo, no andar térreo"
echo
echo "   Acompanhar:  maestri check \"Bigorna\""
echo "   Delegar:     maestri ask \"Prisma\" \"...\""
echo "   Integrar (só você): merge das branches, migration e deploy."
