# PROTOCOLO — como o time se coordena

> Esta é a nota que todo agente lê, inclusive o Regente. Ela não descreve *o que* construir
> (isso é o card) — descreve **como avisar os outros do que você está fazendo**.

## A peça central é o quadro, não o regente

Um orquestrador que só repassa recado é um gargalo com custo de modelo. O que faz o time
paralelizar de verdade é **estado compartilhado que qualquer um lê sem perguntar a ninguém**.

Esse estado é a nota **`quadro`**. Ela é a única fonte de verdade sobre quem está fazendo o quê.
Se não está no quadro, não está acontecendo.

## As cinco escritas obrigatórias

Escreva no `quadro` — sempre — nestes cinco momentos, e em nenhum outro:

| Quando | O que escrever |
|---|---|
| Ao **começar** uma fase | `[Nome] card NN fase N — EM ANDAMENTO · arquivos: a.ts, b.tsx` |
| Ao **terminar** e validar | `[Nome] card NN fase N — AGUARDA REVISÃO · commit <sha>` |
| Ao **ser barrado** | `[Nome] 🔴 BLOQUEADO: <o quê> · preciso de: <quem ou o quê>` |
| Ao **precisar de arquivo alheio** | `[Nome] ⚠️ PEDIDO: preciso tocar em <arquivo>, que é do <outro>` |
| Ao **fechar** uma fase revisada | `[Nome] card NN fase N — FECHADA` |

Escrita curta, uma linha. O quadro é para ser lido de relance; quem escreve parágrafo ali
transforma o painel em diário e ninguém lê nenhum dos dois.

## A regra que evita 90% dos conflitos

**Você declara os arquivos ANTES de tocar neles**, na linha de "EM ANDAMENTO".

Antes de começar, leia o quadro. Se um arquivo que você precisa está declarado por outro agente:
não edite. Escreva um `⚠️ PEDIDO` e siga para outra parte da sua fase. Duas mãos no mesmo arquivo
em andares diferentes viram conflito de merge que só aparece na integração — quando é caro.

## Quando chamar o revisor

Ao fim de **cada fase**, depois dos quatro comandos verdes e do commit:

```
maestri ask "Peneira" "revisa o diff da fase N do card NN: git show <sha>"
```

Trate os achados antes de começar a fase seguinte. Achado que você discorda: responda por que,
não ignore em silêncio. O revisor não edita arquivo — a correção é sempre sua.

## Quando parar

**Pare e relate** ao fim de cada fase. Sempre. Um agente que emenda cinco fases entrega um diff
que ninguém consegue revisar, e feature grande errada custa mais que cinco pequenas certas.

Pare **imediatamente**, sem tentar contornar, quando:

- a tarefa exigir aplicar migration (você escreve o arquivo, o dono aplica)
- a tarefa exigir deploy
- a tarefa exigir qualquer coisa em site da Meta
- a tarefa exigir `npm run dev` (banco de PRODUÇÃO — não existe contorno legítimo)
- você precisar de um segredo que não está no ambiente

Nesses cinco casos, escreva `🔴 BLOQUEADO` no quadro e espere. **Não improvise** — cada um deles
existe porque a alternativa já custou caro uma vez.

## O que o Regente faz, e o que ele não faz

**Faz:** lê o quadro, identifica quem está parado e por quê, resolve pedidos de arquivo decidindo
quem espera quem, chama quem está ocioso, e resume ao dono em **uma linha por agente**.

**Não faz:** escrever código, revisar código, recrutar (precisa de Maestro Mode, que é do terminal
do dono), aplicar migration, fazer deploy, ou repassar tarefa que o dono não pediu.

**A regra que impede o regente de virar ruído:** ele só fala com o dono quando há **decisão a
tomar ou bloqueio a destravar**. "Todo mundo trabalhando normalmente" não é notícia — é o
esperado, e relatar o esperado treina o dono a ignorar o relatório.
