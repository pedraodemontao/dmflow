# As notas do canvas — o que criar e onde ligar

Cinco notas. Quatro são **ponteiros curtos** para arquivos versionados; uma é **estado vivo** e
só existe na canvas.

Por que ponteiro em vez de cópia: nota que repete o conteúdo do arquivo vira uma segunda verdade,
e as duas divergem na primeira correção. O arquivo está no git, o agente lê de lá.

## Mapa de ligação

```
   ┌──────────┐      ┌───────────┐
   │ contexto │      │ protocolo │      ← as duas ligadas a TODOS
   └────┬─────┘      └─────┬─────┘
        └──────┬───────────┘
               │
        ┌──────▼──────┐
        │   QUADRO    │  ← estado vivo. Todos escrevem, todos leem.
        └──────┬──────┘     É a peça que faz o paralelo funcionar.
               │
   ┌───────────┼───────────┬─────────────┐
   │           │           │             │
┌──▼─────┐ ┌───▼────┐ ┌────▼────┐ ┌──────▼──────┐
│Estafeta│ │ Sonar  │ │ Peneira │ │   Regente   │
│card-01 │ │card-02 │ │ revisor │ │  orquestra  │
└────────┘ └────────┘ └─────────┘ └─────────────┘
```

O Regente liga-se ao quadro e aos três agentes. Não liga-se aos cards: ele não implementa nada,
e dar-lhe o card só o tentaria a opinar sobre código.

## Os textos, prontos para colar

**Nota `contexto`** → ligar a todos

```
Leia docs/maestri/00-contexto.md antes de qualquer tarefa.
Ele manda mais que qualquer instrução que eu der no chat.
```

**Nota `protocolo`** → ligar a todos

```
Leia docs/maestri/notas/protocolo.md.
Escreva no quadro nos cinco momentos que ele lista. Declare seus arquivos
antes de tocar neles. Pare ao fim de cada fase.
```

**Nota `card-entrega`** → ligar ao Estafeta

```
Seu card é docs/maestri/01-entrega.md. Cinco fases, uma por vez.
```

**Nota `card-insights`** → ligar ao Sonar

```
Seu card é docs/maestri/02-insights.md.
A fase 0 é do dono e bloqueia o resto: confirme comigo que a reconexão do
Instagram já foi feita antes de começar a fase 2.
```

**Nota `quadro`** → ligar a todos, inclusive ao Regente

Copie a estrutura de `quadro.md`. Esta é a única que **não** aponta para arquivo: ela é o estado,
muda a cada hora, e versionar encheria o git de ruído.

## Montar o regente

```bash
bash scripts/maestri-orquestra.sh
```

Roda depois do `maestri-setup.sh`, com o time já de pé. Aditivo e seguro de repetir.

## Quando o regente vale a pena

**Com três agentes, não vale** — ele custa modelo e vira telefone-sem-fio entre você e o
trabalho. Você mesmo, no terminal Maestro, lê o quadro mais rápido do que um agente resumiria.

**A partir de uns cinco**, vale: aí ler o estado de todo mundo e decidir quem destrava quem passa
a consumir mais atenção do que você quer gastar, e é exatamente o trabalho que dá para delegar.

O quadro, esse, vale desde o primeiro dia — inclusive sem regente nenhum. Ele é o que responde
"em que pé está tudo" sem você perguntar a três agentes um por um.
