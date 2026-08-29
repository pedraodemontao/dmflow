# Como usar estes cards no Maestri

Cada arquivo aqui é um **bloco de nota** do canvas. A nota é a especificação; o agente conectado
a ela é quem executa. O padrão é sempre o mesmo: **a nota manda, o agente obedece, você revisa.**

## Layout do canvas

```
        ┌─────────────────┐
        │ 00-contexto     │  ← conectada a TODOS. É o que impede
        │ (nota mestra)   │     um agente de quebrar invariante sem saber.
        └────────┬────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
┌────▼────┐ ┌────▼────┐ ┌────▼────┐
│ 01-     │ │ 02-     │ │ 04-/05- │
│ entrega │ │ insights│ │ publicar│
└────┬────┘ └────┬────┘ └─────────┘
     │           │
┌────▼────┐ ┌────▼────┐
│ agente  │ │ agente  │   um agente por card, rodando em paralelo
└────┬────┘ └────┬────┘
     └─────┬─────┘
      ┌────▼────┐
      │ revisor │  ← lê os diffs dos dois, não escreve código
      └─────────┘
```

**Por que a nota de contexto fica separada:** ela repete em toda conversa e nunca muda. Enfiá-la
dentro de cada card faria você manter a mesma informação em três lugares — e ela é justamente a
parte que não pode ficar desatualizada.

**Por que os cards 01 e 02 podem correr em paralelo:** tocam em arquivos diferentes. O 01 mexe em
`src/lib/ai/`, `src/app/e/` e `src/lib/flow/engine.ts`; o 02 em `src/lib/instagram/`, no tick e nas
telas de métrica. O único encontro é a linha `delivery_views` no funil da fase 3 do card 02 — que
o 02 lê como opcional. **Se rodarem em paralelo, use floor isolado** (`maestri floor create`),
senão os dois disputam a mesma árvore.

**Cards 04 e 05 (29/08/2026) correm em paralelo, com uma dependência declarada.** O 04
(`Prelo`) é dono de `src/lib/instagram/publish.ts`, `src/lib/publications/`, da chamada no tick e
de `src/app/(app)/publicacoes/` (menos `gerar/`); o 05 (`Forja`) é dono de
`src/lib/ai/generate-carousel*`, `src/lib/render/` e `src/app/(app)/publicacoes/gerar/`. A fase 3
do 05 importa `createPublication` do 04 e só começa quando o quadro disser
`card 04 fase 4 — FECHADA`. Montagem: `bash scripts/maestri-publicar.sh` — isolamento por
**worktree**, não por andar: a worktree não tem `.env.local`, então o recruta não alcança o banco
de produção nem por engano. Merge do 04 antes do 05.

## Comandos de montagem

```bash
maestri role create "Implementador dm-flow" "$(cat docs/maestri/00-contexto.md)

Você implementa uma feature por vez, na ordem das fases do card conectado a você. Ao terminar
CADA fase: rode os quatro comandos de validação, faça um commit com mensagem no padrão do
repositório, e pare para relatar antes de começar a próxima. Nunca emende fases num commit só.
Rode \`maestri list\` para ver seus companheiros e as notas compartilhadas. Quando terminar uma
fase, chame \`maestri ask \"Revisor\" \"revisa o diff da fase N\"\` e trate o retorno antes de
seguir."

maestri role create "Revisor dm-flow" "$(cat docs/maestri/00-contexto.md)

Você NÃO escreve código. Lê diffs e responde com achados, um por linha, no formato
\`arquivo:linha: severidade: problema. correção.\`

Procure especificamente, nesta ordem de prioridade:
1. invariante do CLAUDE.md quebrado (anti-spam, claim otimista, janela de 24h, webhook 200)
2. erro engolido — retorno de Supabase ignorado, catch vazio, erro que vai para um array
3. valor derivado gravado em coluna bigint
4. rota nova em PUBLIC_PATHS sem defesa própria
5. teste que codifica o bug em vez de pegá-lo
6. texto de UI que mente sobre o estado do sistema

Não comente estilo. Não sugira refatoração fora do escopo do diff."

maestri recruit "<codinome>" --role "Implementador dm-flow"
maestri recruit "<codinome>" --role "Revisor dm-flow"
```

## O prompt de kickoff

O que você digita para o agente depois de conectar a nota:

```
Leia a nota conectada e o 00-contexto. Antes de escrever qualquer código:

1. Confirme contra o repositório o que a nota afirma. Ela foi escrita em 01/08/2026 e pode
   estar velha. O que não bater, me diga antes de continuar.
2. Me devolva o plano da fase 1 em no máximo 10 linhas: arquivos que vai tocar, o que cada um
   passa a fazer, e o que pode quebrar.
3. Espere meu OK.

Depois disso, execute fase por fase, parando para relatar entre elas.
```

**O passo 1 não é formalidade.** Card escrito hoje descreve o repositório de hoje; agente que
começa a codar sem conferir constrói em cima de uma suposição, e o erro só aparece no fim.

---

## Template para cards futuros

Copie a estrutura. A ordem das seções importa: **problema antes de solução** — agente que recebe
só a solução otimiza a solução, e é assim que se implementa direitinho a coisa errada.

```markdown
# CARD NN — <o resultado, em uma frase>

> Pré-requisito: leia `00-contexto.md`.
> Tamanho: N fases, cada uma entregável sozinha.

## O problema real
O que dói hoje, com evidência. Se houver um caso concreto (um lead perdido, um 404 em
produção, um erro em log), ponha ele aqui — é o que impede a feature de virar enfeite.

## O que construir
O desenho em três linhas e um diagrama de fluxo. Sem detalhe de implementação ainda.

## Fase 1 … N
Para cada fase: onde mexer, o que fazer, e **o porquê de cada decisão que parece arbitrária**.
Toda vez que escrever "faça X e não Y", escreva o motivo — senão o agente troca por Y na
primeira dificuldade, com boa intenção.

## Definição de pronto
Checklist verificável. Sempre inclui os quatro comandos e "provado contra o quê".

## O que NÃO fazer
A lista mais curta e mais valiosa. Cada linha aqui é um erro que alguém já cometeu ou que a
plataforma pune.
```

### As quatro coisas que fazem um card funcionar

1. **Evidência no lugar de opinião.** "A automação `mapa` devolve 404 e está ativa" faz um
   agente agir. "Seria bom ter páginas de entrega" faz um agente inventar.
2. **Porquê junto de cada regra.** Regra sem motivo é regra que se descumpre com boa intenção.
3. **Fases que param.** Agente que roda cinco fases seguidas entrega um diff que ninguém revisa,
   e uma feature grande errada custa mais que cinco pequenas certas.
4. **Uma lista de não-fazer.** É onde mora o que a plataforma pune e o que já custou caro — a
   parte que o agente não tem como deduzir do código.

---

## Estado do projeto quando estes cards foram escritos

01/08/2026. Em produção, entregando por polling a cada minuto. Migrations 0001–0015 aplicadas.
486 testes verdes. Biblioteca de conteúdo com 40 itens de 4 perfis. Último deploy: os dois
consertos de 01/08 (mediana fracionária, mensagem de raspagem).

Pendências do dono estão em `HANDOFF.md` §8 — a mais urgente é o link 404 da automação `mapa`,
que o card 01 resolve de vez.

**29/08/2026.** Migrations 0001–0020 aplicadas. 50 arquivos de teste. Card 01 entregue; card 02
com o código no lugar e a reconexão do dono ainda pendente; card 03 escrito e não executado.
Cards 04 e 05 escritos depois de avaliar e **recusar** o porte do Bravy Publisher — o porquê está
no topo do `04-publicar.md`, para não ser rediscutido.
