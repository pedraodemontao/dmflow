# HANDOFF — dm-flow

> Estado em 2026-08-01. Sistema em produção, entregando por polling.
> Este documento é o primeiro dia de quem vai assumir: o que o produto faz, por onde o dado
> entra, o que já quebrou de verdade e o que ainda não foi provado.
> Regras invioláveis: `CLAUDE.md`. Como rodar e configurar: `README.md`. O que falta: `ROADMAP.md`.
> Trabalho em fila, pronto para agente: `docs/maestri/`.

---

## 1. O que é, e para quem

Clone self-hosted do núcleo do ManyChat para Instagram, de uso próprio. **Single-tenant**: uma
conta do Instagram, um usuário, uma senha no painel (`PANEL_PASSWORD`). Não existe cadastro,
papéis nem cobrança — e nada no schema foi desenhado para vender isso como serviço, embora
todas as tabelas já isolem por `account_id`.

O que ele faz: alguém comenta uma palavra-chave num post → a conta responde publicamente no
comentário → manda uma DM (private reply) → e a partir daí caminha por um fluxo montado num
canvas visual (mensagem, botões, condição, delay, etiqueta, pergunta validada, mídia, webhook
externo). Também dispara por palavra-chave na DM, por resposta de story e por ice breaker.

Além do ManyChat, este projeto tem três coisas que nasceram de dor própria e que valem mais
que qualquer bloco novo: **a blindagem anti-spam** (seção 4) e **o painel de risco**, que lê
`send_log` e `messages` e diz por que o risco subiu (similaridade de texto, volume/hora,
concentração em rajada, proporção de resposta pública, envio de madrugada) — e a **biblioteca
de conteúdo** (seção 5.5), que raspa perfis do nicho, mede o que performou acima da mediana
do próprio autor e escreve roteiro novo modelado no vencedor.

A biblioteca não é enfeite: ela é a metade de cima do funil que a automação executa embaixo.
O vídeo pede o comentário, a automação entrega. As duas features na fila (`docs/maestri/`)
existem justamente para fechar esse laço — a entrega do presente nasce junto do roteiro, e os
insights do post voltam para quem escreveu.

Quem lê isto é programador. A parte difícil aqui não é o código — é a política da Meta e o
filtro de spam do Instagram. Quase toda decisão estranha deste repositório tem uma data e um
incidente por trás; elas estão na seção 4 e nas mensagens de commit, que são longas de
propósito.

---

## 2. Como o dado entra: polling, não webhook

**A entrega é por varredura ativa a cada minuto.** O webhook existe, está implementado, está
assinado — e nunca entregou um único evento neste projeto.

O diagnóstico completo (preservado do HANDOFF anterior, porque foi caro):

Receber webhook do Instagram exige **três** coisas, e faltando qualquer uma o app fica mudo,
sem erro, sem log e sem pista:

1. **Assinatura no nível do APP** — `POST /{fb-app-id}/subscriptions`, com o token
   `{app_id}|{app_secret}` do **Facebook** App. Cadastrar a URL na interface não assina campo
   nenhum, e a UI nova da Meta nem mostra essa lista. Conferir com
   `GET /{fb-app-id}/subscriptions`: `{"data":[]}` é o problema.
2. **Assinatura no nível da CONTA** — `POST /me/subscribed_apps` com o token da conta. O
   callback do OAuth já faz isso (`subscribeToWebhooks`, `src/lib/instagram/api.ts`).
3. **App publicado**, o que exige URL de política de privacidade (servida em `/privacidade`).

As três estiveram ativas (`active: true`) e a entrega nunca aconteceu. Hipóteses levantadas na
época: propagação ou bug da Meta. Nenhuma foi confirmada. Enquanto o polling roda, é
irrelevante — e **não é prioridade resolver**: a blindagem anti-spam já adia comentário de
propósito, então o webhook não deixaria a resposta mais rápida. O que ele destravaria é
atribuição por `ref` e por anúncio (seção 6).

O polling vive em `src/lib/webhook/poll.ts` e alimenta **a mesma fila** do webhook
(`webhook_events`). O `dedup_key` (`comment:<id>` / `msg:<mid>`) torna os dois idempotentes
entre si: se a Meta um dia começar a entregar, nada duplica.

Três propriedades da varredura que não são detalhe:

- **É por cursor, não por janela fixa.** `accounts.comments_cursor` e `messages_cursor`, com
  5 min de sobreposição. Sem isso, comentário que chega durante uma queda do cron some para
  sempre — foi exatamente o cenário das 22 horas de 30/07.
- **O cursor só avança depois que a fila aceitou a escrita.** `enqueue()` **lança** em erro do
  Supabase, de propósito: a versão que devolvia `{ error }` teve o retorno ignorado, o cursor
  avançou por cima de comentários que nunca entraram na fila, e o tick respondeu `ok:true`.
  Retorno se ignora por acidente; exceção não.
- **Tick que não conseguiu varrer responde 503.** O histórico do pg_cron é a única coisa que
  avisa que a automação parou. Responder 200 quando a varredura falhou foi o que permitiu 22h
  de silêncio marcadas como `succeeded`.

Custo: cada tick lista até 200 posts (8 páginas × 25) e, para cada post, até 20 páginas de 25
comentários, mais 8 páginas de conversas. Na prática a maioria das páginas termina na primeira,
mas o piso é da ordem de uma chamada por post por minuto. É esse volume — e não a latência —
que um dia vai justificar voltar ao webhook.

---

## 3. O caminho completo de um comentário, na ordem

1. **pg_cron no Supabase** chama `GET /api/cron/tick?secret=…` a cada minuto — configurado à mão
   fora deste repositório (seção 7), então é o único elo que o código não prova. A rota autentica
   por `CRON_SECRET` (header `Authorization: Bearer` ou query `?secret=`). O cron do
   `vercel.json` é só backup diário às 03h — o plano Hobby não permite mais que isso. **Se o
   pg_cron parar, a automação para com ele.**

2. **`pollComments`** busca as mídias da conta e, por mídia, os comentários com expansão de
   campo `replies.limit(25)`. A expansão traz a thread no mesmo request: sem ela, o caso mais
   comum do produto era invisível — o bot responde "te mandei no direct" e a pessoa responde
   *dentro daquela thread*, o que nunca aparece em primeiro nível.

3. **Filtro de autoria.** Comentário da própria conta é descartado. Dentro de uma thread,
   autoria desconhecida também é descartada (fail-closed): é lá que mora a resposta pública que
   o bot acabou de publicar, e deixar passar seria o bug do `is_echo` de novo — o bot disparando
   fluxo em cima da própria resposta, em laço.

4. **`enqueue`** grava em `webhook_events` (upsert por `dedup_key`). Evento de comentário nasce
   com `process_after` no futuro: **jitter de 8–35 s**. Resposta instantânea é assinatura de bot.

5. **Cursor avança.** Só aqui, e só se o passo 4 não lançou.

6. **`requeueStuckEvents`** devolve para `pending` o que travou em `processing` há mais de 5 min
   (deploy no meio, timeout), medindo `process_after` — que o claim carimba — e não `created_at`.
   Com `created_at`, dois ticks sobrepostos reprocessavam o mesmo evento e mandavam a DM duas
   vezes.

7. **`processPending(50)`** pega o que está pendente e vencido, e faz **claim otimista**
   (`status: pending → processing` condicionado a `status = pending`). O `maxDuration` do tick é
   300 s e o cron dispara a cada 60 s: até cinco ticks convivem, então tudo que envia precisa de
   claim.
   - Pânico ligado (`accounts.automations_paused`): volta para a fila em 60 s, **com a tentativa
     devolvida** — adiar não é falhar.
   - Horário de silêncio: adia para a abertura **mais jitter**. Sem o jitter, todos os eventos
     da madrugada recebiam o mesmo instante e disparavam juntos às 08:00:00 em ponto.

8. **`handleComment`**: casa o gatilho (`triggers`, por tipo, palavra-chave, `match_mode` e
   `media_id`), carrega o fluxo (precisa estar `is_active`), e faz `upsertContact` com
   **`markInbound: false`** — comentar não abre a janela de 24 h — gravando a **origem de
   primeiro toque** (`source_type = 'comment'`, `source_id = <media_id>`).

9. **Resposta pública**, se o gatilho tiver uma: passa por `spin()`, e então:
   - dentro do cap por post (`PUBLIC_REPLY_PER_POST_CAP`, padrão 8/h no mesmo post) e do cap
     global (`SEND_HOURLY_CAP`, padrão 60/h na conta) → publica e registra em `send_log`;
   - fora de qualquer um dos dois → vai para `pending_public_replies` e sai depois, espaçada.
     **Nunca é descartada.**
   - Em seguida marca `webhook_events.public_reply_sent = true`, com uma retentativa e um log
     alto se falhar: é essa marca que impede o retry de republicar o comentário.

10. **`startFlow`**: recusa contato descadastrado; recusa se já existe run `running` /
    `waiting_reply` / `sleeping` para o contato (um fluxo por contato por vez, índice único
    parcial em `flow_runs`); e, se existe um run **`failed`** deste fluxo com `current_node`,
    **retoma de onde parou, com claim** — nunca recomeça do início (seção 4.5).

11. **`walk()`** caminha nó a nó, com `MAX_STEPS = 30` como trava contra ciclo. Cada passagem
    grava `flow_node_events` sem `await` bloqueante: métrica é acessório, entrega não.

12. **`deliver()`**: `assertUnderSendCap` **antes** de qualquer coisa, depois `interpolate` e
    então `spin` — nessa ordem, e isso importa (seção 4.7). Título de botão e de quick reply
    também passam pelos dois.
    - Com `pendingCommentId` (primeira mensagem de um fluxo de comentário) → **private reply**,
      levando botões e quick replies junto. É o toque no botão de postback que **abre a janela
      de 24 h**; sem botão, a automação manda uma mensagem e morre.
    - Sem ele → DM comum, que exige `canSendDm` (menos de 24 h desde `last_inbound_at`).
    - Cap estourado (`SendCapError`) → o run dorme 5 min e o cron re-executa o **mesmo nó**.

13. **A pessoa toca no botão.** Pelo webhook isso chegaria como `payload`; pelo polling chega
    como **título**, porque o toque aparece como mensagem comum em `/me/conversations`.
    `payloadForText` traduz título → payload lendo as definições da conta, e recusa traduzir
    quando o mesmo título aponta para payloads diferentes. Sem essa tradução, condição escrita
    contra o payload pega o caminho errado em silêncio.

14. **`handleMessaging`**: descarta `is_echo`; `upsertContact` com `markInbound: true` (abre a
    janela e revalida o perfil a cada 24 h); grava em `messages`; registra o clique em
    `button_clicks`; e então **retoma o fluxo que esperava resposta** ou casa um gatilho novo.

15. **Fim do tick**: `resumeSleepingRuns` (com claim — sem ele, dois ticks percorriam o mesmo
    run e reenviavam todas as mensagens seguintes), `refreshExpiringTokens` (renova faltando 10
    dias dos 60) e `drainPublicReplies` (uma por post por rodada, 12 por tick, 4 s entre elas —
    o cap limita o volume, o espaçamento limita o padrão).

---

## 4. As armadilhas que já custaram caro

Cada uma abaixo aconteceu. A regra vem depois do fato, não antes.

### 4.1 Restrição de conta por repetição — 30/07/2026

A conta e o perfil da BM tomaram restrição da Meta e os comentários do post automatizado foram
removidos. Causa: resposta automática **idêntica e instantânea, em volume** — parede de
comentários iguais no mesmo post.

O que existe hoje por causa disso, e que **não pode ser removido**:

- **Spintax `{a|b|c}`** em todo texto de envio (`spin()`), e **variação obrigatória para
  ativar** (`src/lib/flow/variation.ts`): `saveAutomation` recusa ativar automação cuja resposta
  pública tenha menos de 3 variantes, ou cujo texto de fluxo tenha menos de 2. Rascunho pausado
  continua livre. A cobrança vale para todo texto que a pessoa lê — inclusive as bolhas do bloco
  `bubbles`, a legenda de mídia e a repergunta do `ask`, que escapavam até 31/07 (um bloco de
  cinco bolhas idênticas ativava sem reclamação).
- **Jitter de 8–35 s** antes de processar evento de comentário. Começou em 30–120 s e foi
  reduzido depois de testar com lead real: o que o filtro pune é resposta imediata e sempre
  igual, não resposta em 20 segundos.
- **Cap de envios por hora** (`send_log` + `SEND_HOURLY_CAP`) e **cap de resposta pública por
  post** (`PUBLIC_REPLY_PER_POST_CAP`). O cap **falha fechado**: erro ao consultar `send_log`
  conta como cap estourado. Cap que falha aberto é pior que cap nenhum, porque dá falsa
  segurança justo quando tudo está ruim.
- **Espaçamento na drenagem** da fila de resposta pública, e **jitter na reabertura** do horário
  de silêncio.

Se você remover uma dessas camadas, o sintoma não aparece no dia — aparece quando o post
estoura.

**Regra correlata, do mesmo custo:** nunca use automação de navegador em site da Meta
(`developers.facebook.com`, `business.facebook.com`, `facebook.com`, `instagram.com`) com a
sessão logada. Foi isso que disparou a restrição. Chamada à Graph API por `curl` é aceitável,
com parcimônia.

### 4.2 Token do Instagram morto por troca de senha do Facebook — 30/07/2026

Trocar a senha do Facebook **invalida o token do Instagram**. A automação ficou **22 horas
parada** sem nenhum sinal além de `OAuthException code 1` nos `flow_runs`. Três coisas
mentiam ao mesmo tempo:

- O painel mostrava "conectado" em verde só porque existia linha em `accounts` — e o botão de
  reconectar só aparecia quando **não** havia conta. O dono via o problema e não tinha como
  resolver pela interface. Hoje `checkAccountHealth` consulta a Meta de fato e separa três
  casos: token inválido (fatal, o polling usa o mesmo token), conta sem inscrição em webhook
  (não é fatal — a entrega é por varredura) e Meta indisponível.
- `fetchJson` do polling devolvia `null` para qualquer erro da Meta, então token morto era
  indistinguível de "não havia nada novo". Hoje lança `PollError` e o tick responde 503.
- O callback do OAuth redirecionava com `?erro=` e a página ignorava — a reconexão que falhava
  voltava para um painel de aparência normal.

Depois de qualquer mexida em senha ou segurança da conta do Facebook, **reconecte pelo painel**.

### 4.3 Resposta pública duplicada — noite de 30/07 (o código a chama de "incidente de 31/07")

A resposta pública saía **antes** de o fluxo começar. Quando o fluxo falhava, o evento voltava
para a fila e o retry **republicava o comentário**. Dois comentários viraram quatro respostas,
com 60 s de intervalo — padrão de spam de livro.

Correções, em camadas: `webhook_events.public_reply_sent` (migration 0008) marca **antes** de
seguir; o erro dessa marcação não passa mais batido (`.update()` não lança, então um erro ali
era silencioso e a duplicata voltava); e a fila `pending_public_replies` ganhou **claim** por
`sent_at`, porque a migration 0008 protegeu o caminho imediato e deixou a fila descoberta —
dois ticks na fase de drenagem liam o mesmo topo e respondiam o mesmo comentário.

Rede de última instância: a Meta recusa a segunda private reply do mesmo comentário com o
código 10900, classificado como permanente em `instagram/errors.ts`. Mas contar com isso é
contar com a política de terceiro; a marca vem primeiro.

### 4.4 Comentário perdido por orçamento de retentativa curto — 30/07/2026

A invariante do produto é **"todo comentário é respondido, nem que demore"**. Ela furou: eram
3 tentativas seguidas, cerca de 3 minutos de horizonte, e o token ficou 22 horas fora. Dois
comentários queimaram as tentativas nos primeiros minutos e ficaram `failed` para sempre — **sem
aparecer em lugar nenhum do painel**.

Hoje: a espera dobra a cada tentativa até um teto de 6 h, com orçamento de 12 tentativas, o que
passa de 24 horas de horizonte. Uma queda de um dia inteiro não mata mais o comentário. E o que
ainda assim é descartado vira card no topo de "Precisa de ação", com responder agora ou
dispensar. Reprocessar é seguro porque `public_reply_sent` marca o que já saiu.

Na mesma família, dois furos de captura que também perdiam lead em silêncio e pioravam quanto
mais o post viralizasse: o polling só olhava 10 posts, 25 comentários por post e 1 h para trás
(migration 0009); e `pollMessages` não paginava — 15 conversas × 5 mensagens, com o cursor
avançando por cima do resto.

### 4.5 Erro permanente retentado, reexecutando o fluxo do início — 31/07/2026

**O furo mais grave da auditoria, e estava no caminho que roda todo dia.**

`send()` transformava qualquer resposta de erro da Meta numa `Error` genérica. Ninguém lia
`error.code` nem `error_subcode`, então payload inválido era retentado igual a instabilidade de
rede. E como `startFlow` não bloqueava run em `failed`, **cada retentativa criava um run novo e
caminhava desde a entrada** — reentregando toda mensagem já enviada antes da falha. Doze
retentativas viravam doze cópias da mesma sequência: exatamente o padrão de repetição que
causou a restrição de 4.1.

Três mudanças: erro da Meta virou `MetaSendError` com código e subcódigo; a classificação separa
permanente de transitório, **com o desconhecido caindo em transitório** (errar para permanente
perde mensagem de verdade, errar para transitório só gasta retentativa); e `startFlow` retoma o
run morto de onde parou, com claim.

Detalhe honesto que está no próprio arquivo: a tabela oficial de códigos de messaging da Meta
estava fora do ar quando a lista foi montada. Só `10/2534022` aparece corroborado em fonte
oficial; o resto vem de compilação de terceiros. Daí a regra do desconhecido = transitório.

### 4.6 Bloco de mídia que sempre morria em fluxo de comentário — 31/07/2026

**Todo bloco de imagem/vídeo/áudio/arquivo alcançado a partir de um comentário morria.** Anexo
não cabe em private reply, e comentar não abre a janela de 24 h — então o código mandava a
legenda pela private reply e o anexo como DM comum, que a Meta recusa com *"outside of allowed
window"*. A pessoa recebia só a legenda e o fluxo inteiro parava. Os testes garantiam esse
comportamento, ou seja, **codificavam o bug**.

Hoje o run para em `waiting_reply` no próprio nó: a legenda sai pela private reply (com o convite
para responder ou tocar no botão), a pessoa responde, a janela abre, e o anexo sai na retomada.

Bug vizinho, encontrado ao generalizar o bloco de imagem: a legenda podia sair **duas vezes**
(private reply + DM comum), porque o segundo envio checava `ctx.pendingCommentId` depois de o
primeiro já ter apagado esse campo como efeito colateral — e fora da janela isso derrubava o
fluxo inteiro.

### 4.7 Validador recusando texto que funciona — 31/07/2026

No envio a interpolação roda **antes** do spin, então `{Oi {{nome}}!|E aí {{nome}}!}` vira
`{Oi Pedro!|E aí Pedro!}` e sorteia normalmente: o texto funciona. Mas o validador olhava o
template cru e a expressão de grupo não aceita chave dentro — contava 1 versão e **recusava
salvar**. Ou seja, rejeitava texto que funciona e empurrava o dono para a forma
`{Oi|E aí} {{nome}}`, que é válida mas é só uma das maneiras certas. `variantCount` e
`splitVariations` agora mascaram `{{variavel}}` antes de olhar para os grupos.

Isso é sintoma de um padrão que se repetiu três vezes na mesma tarde: a trava anti-spam existia
desde 30/07, mas a interface era um campo de texto só — para cumprir a regra o dono teria que
digitar `{a|b|c}` de cabeça. Ele empilhou uma frase embaixo da outra, que é a leitura natural de
"escreva três versões", e a ferramenta recusou sem ensinar. **Trava que o usuário não consegue
satisfazer não é proteção, é beco sem saída.** Hoje cada versão é um campo, com contador do que
falta, e o modo avançado continua existindo para spintax no meio da frase.

### 4.8 Fluxo que perde gente sem erro nenhum — 31/07/2026

Caso real: a pessoa comentou, recebeu a DM, respondeu **"Pode enviar"** — e a condição só
aceitava "SIM" ou "quero". Caiu no `senão`, que se despedia e encerrava. Nada falhou: nenhum
erro, nenhum log, `flow_run` concluído. O lead entrou, disse sim com as próprias palavras e saiu
sem o material.

O builder hoje marca (`src/lib/flow/leaks.ts`) bloco inalcançável, ponta solta, referência a
bloco apagado e **toda condição que compara texto livre**, dizendo quais palavras ela procura.
Não tenta adivinhar se o galho está errado: a tentativa de heurística acusou o fluxo já
corrigido, e falso positivo em alerta é como se aprende a ignorar alerta.

### 4.9 Mediana fracionária deixando um perfil inteiro sem régua — 01/08/2026

Perfil com número **par** de vídeos produz mediana com `.5`. A coluna `median_plays` é `bigint`,
e o Postgres recusava com `invalid input syntax for type bigint: "12157.5"`. O erro caía no array
`errors` da raspagem, que a tela mostra em cinza claro e ninguém lê.

O estrago era total e silencioso: sem mediana o perfil não tem régua, e **sem régua nenhum vídeo
dele ganha multiplicador de outlier** — que é a única coisa que a biblioteca serve. @maxcarrau.ia
ficou assim; @dfolloni escapou por ter número ímpar de vídeos. Consertado com `Math.round` e teste.

A lição vale além deste bug: **erro que vai para uma lista em vez de subir é erro que não existe.**
Se a raspagem tivesse falhado alto, teria sido visto no mesmo minuto.

### 4.10 "Faltam 0 perfis" com a raspagem no ar — 01/08/2026

A Apify leva um a dois minutos e o orçamento da nossa chamada é de 50 s (`SCRAPE_BUDGET_MS`),
então a primeira tentativa **sempre** volta com a rodada ainda em voo e exige um segundo clique
para colher. A tela dizia "Faltam 0 perfis" e o botão voltava a "Raspar agora".

Zero na fila foi lido como "nada pendente", quando significava "nada mais a COMEÇAR — o que falta
é esperar". O dono concluiu que a raspagem estava quebrada. Ela estava certa; a frase é que
mentia. Hoje o botão diz **"Trazer o resultado"** enquanto houver rodada pendente.

---

## 5. O que está provado em produção × o que só passa em teste

**Esta é a distinção mais importante deste documento.** O CI roda tipos, lint, testes e build em
toda branch, e há 27 arquivos de teste — mas "passa no schema e no vitest" não é a mesma coisa
que "a Meta aceitou o payload".

**Provado com dado real, em produção:**

- Comentário com palavra-chave → resposta pública → private reply → DM do fluxo, com `{{nome}}`
  interpolando. Testado ponta a ponta com lead real, e depois exercitado à força pelos incidentes
  de 30–31/07.
- Botão de postback na private reply abrindo a janela de 24 h (é o padrão que sustenta fluxo de
  várias mensagens a partir de comentário).
- Polling de comentário e de DM, fila com dedup, cap, jitter, resposta pública enfileirada.
- Chat ao vivo com envio manual, e `automation_paused` quando o humano assume.
- **Condição "segue a conta"** (migration 0015). O campo `is_user_follow_business` vem de graça
  na mesma chamada de perfil que já fazíamos, e voltou `true` para os dois contatos reais
  conferidos em 01/08. O portão reconfere ao vivo antes de barrar (`FOLLOW_RECHECK_MS`, 20 s) —
  sem isso o laço do ManyChat nunca fecha: a pessoa é barrada, vai seguir, volta, e seria barrada
  de novo com o dado velho em cache.
- **Biblioteca de conteúdo** (seção 5.5): 40 itens de 4 perfis raspados via Apify, medianas
  calculadas, capas guardadas no nosso Storage.

**Nunca enviado de verdade à Meta — tratar como não pronto:**

- **Carrossel.** Passa no schema e nos testes de engine. Ninguém confirmou que a Meta aceita o
  payload. Ainda que aceite, o carrossel **não aparece no Instagram Web** (limitação
  documentada pela própria Meta): quem abre o direct pelo navegador não vê os cards. Se a oferta
  depende do card, parte do público não recebe a oferta.
- **Vídeo, áudio e arquivo.** Mesmo caminho da imagem, só muda o `type` do anexo. Nunca
  exercitados contra a API real. Repare que a lista de formatos aceitos pela Meta **não inclui
  `mp3`** em áudio — que é a extensão que qualquer um escolheria.
- **Pular para outro fluxo (`goto_flow`) e sequência de bolhas (`bubbles`).** Têm testes de
  engine dedicados; não encontrei registro de um disparo real de nenhum dos dois.

**Implementado e coberto por teste, mas sem confirmação de uso real:**

- **Resposta de story.** O caminho foi revisado inteiro e coberto por testes em `process.test.ts`;
  nenhum bug foi encontrado. Nunca vi registro de disparo real.
- **Ice breakers.** A tela publica via `POST /messenger_profile` e o toque cai no matcher de
  palavra-chave (payload = palavra-chave com `match_mode: exact`). Não achei confirmação de que
  a publicação foi aceita pela Meta em produção.
- **Cliques por botão.** Código e migration 0013 escritos em 31/07. A migration **foi aplicada e
  verificada em produção** no mesmo dia (tabela responde, as oito colunas existem, escrita testada
  com `flow_id` nulo). O contador segue em zero por um motivo de plataforma, não por bug: os
  botões dos fluxos atuais são de LINK, e link abre o navegador sem devolver sinal nenhum à Meta.
  Só botão de postback registra clique. `getButtonClicks` devolve
  lista vazia e `recordButtonClick` só loga quando a tabela não existe, justamente porque a
  migration é aplicada à mão — **não consegui confirmar se ela já foi rodada no banco de
  produção.** Confira antes de acreditar na tela.

Regra prática para quem assumir: antes de vender ou depender de um bloco, mande um de verdade
para a própria conta e olhe o direct. O schema mente com boa-fé.

- **Gerador de roteiro.** A rota `/api/scripts/generate-from-item` está escrita, tem schema Zod
  e devolve o roteiro mesmo quando falha ao gravar (o dono já pagou a geração; esconder o texto
  o faria pagar de novo). **Nunca foi executado uma vez sequer** — `scripts` tem zero linhas.
  A primeira execução é a validação que falta.

---

## 5.5 A biblioteca de conteúdo

Portada do projeto `~/projects/paInel-nocode-pedro` em 01/08. Serve para responder "sobre o que
eu gravo hoje" com dado em vez de palpite.

**Como funciona:** `tracked_profiles` guarda perfis do nicho. A raspagem chama o ator
`apify~instagram-scraper` (pay-per-result, **US$ 0,0027 por resultado** — medido, não estimado),
grava em `library_items` e calcula a **mediana de plays do próprio autor**. O multiplicador de
outlier é `plays ÷ mediana daquele perfil` — comparar um perfil com o outro não diria nada,
porque a base de seguidores é diferente.

**Duas armadilhas já pagas, ambas na seção 4:**

- O Instagram devolve **dois contadores de view** para o mesmo vídeo: `videoViewCount` (4.719) e
  `videoPlayCount` (112.806). O outlier é medido sobre **plays**. Trocar os dois muda o
  multiplicador por um fator de 20.
- **Capa de post é copiada para o nosso Storage** (bucket `library-thumbs`), nunca linkada do CDN
  do Instagram. O navegador pede as dez capas de uma vez e o CDN derruba a maioria com 503 — oito
  de dez, medido no log de rede. Não é referrer nem formato de URL: é rajada. Some a isso que a
  URL assinada expira, e hotlink deixa de ser opção.

**Estado real em 01/08:** 4 perfis rastreados (de 31 curados), 40 itens, 37 com multiplicador,
medianas entre 12k e 26k plays. Zero roteiros gerados.

**Custo:** plano grátis da Apify dá ~US$ 5/mês, o que compra cerca de 1.800 resultados. A tela
mostra o custo estimado **antes** de rodar, de propósito: ferramenta que gasta dinheiro sem
avisar é ferramenta que o dono desliga.

---

## 6. O que está bloqueado pela plataforma, não por nós

Estes não são itens de backlog. São coisas que o código já suporta e que **não têm como
funcionar** enquanto a situação atual não mudar:

- **Atribuição por link de referência (`ig.me/m/conta?ref=campanha`)** e **por anúncio
  Click-to-Direct (`ad_id`)**. Esses dados só chegam por webhook, e o webhook nunca entregou. O
  polling não expõe nenhum dos dois. As colunas `contacts.source_type` / `source_id` já foram
  deixadas genéricas de propósito: no dia em que o webhook funcionar, `ref` e `ad_id` entram nas
  mesmas colunas sem migration nova.
- **Menção em story.** `detectMessagingTriggerType` já reconhece o anexo `story_mention`, o
  gatilho existe no schema (migration 0010) e o matcher está pronto. Mas o anexo só chega por
  webhook — o polling de `/me/conversations` pede `id,created_time,from,message` e **não pede
  `attachments`**. Estender isso não foi feito por risco de quebrar o polling de DM, que é o que
  sustenta a produção. (Cuidado com um engano já cometido: `story_insights` **não** é isso —
  aquele campo é métrica do próprio story.)
- **Comentário em live.** `live_comments` está na lista de campos assinados, mas não há
  tratamento próprio nem varredura equivalente no polling.
- **Broadcast fora da janela de 24 h.** Não existe. O Instagram simplesmente não deixa mandar DM
  comum fora dela; a tag `HUMAN_AGENT` estende para 7 dias, mas é para atendimento humano, não
  para campanha. Qualquer "broadcast" aqui será, na melhor das hipóteses, segmentado e dentro da
  janela.
- **Curva de retenção segundo a segundo.** Não existe em API nenhuma da Meta — é exclusiva do app
  do Instagram. O que a API dá é `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time` e
  `reels_skip_rate`: média e taxa de pulo, não a curva. Qualquer tela que prometa "o segundo em
  que a pessoa saiu" está prometendo o que não pode entregar.

**Bloqueado hoje, mas com o caminho conhecido — insights do próprio post.** Medido por `curl`
contra a conta real em 01/08: **todas** as métricas de mídia respondem
`Application does not have permission for this action`. A causa é o escopo — `SCOPES` em
`src/lib/instagram/oauth.ts` pede três (`instagram_business_basic`, `..._manage_messages`,
`..._manage_comments`) e falta `instagram_business_manage_insights`.

A prova de que a limitação é de permissão e não de existência: pedindo uma métrica inválida, a
própria Meta devolve a lista do que aceita. Vale registrar, porque é a documentação mais confiável
que existe sobre isso:

```
mídia: impressions, shares, comments, likes, saved, replies, total_interactions, navigation,
       follows, profile_visits, profile_activity, reach, ig_reels_video_view_total_time,
       ig_reels_avg_watch_time, views, reels_skip_rate, link_clicks, total_views, …
conta: reach, follower_count, website_clicks, profile_views, online_followers, accounts_engaged,
       follows_and_unfollows, profile_links_taps, views, follower_demographics, …
```

`follows` por mídia é exatamente "quantos seguidores este vídeo trouxe". Está lá. Só falta o
escopo e uma reconexão da conta pelo painel. Detalhe do plano em `docs/maestri/02-insights.md`.

---

## 7. Onde as coisas rodam

| Item | Valor |
|---|---|
| Painel | `https://dm.nocodepedro.site` (senha em `PANEL_PASSWORD`, ver `.env.local` local / Vercel) |
| Hospedagem | Vercel, projeto `dm-flow`, conta `barroslab` |
| Banco | Supabase `dm-flow`, ref `xbiebyteiaambworezyi` (org Ghost Money, sa-east-1) |
| Agendador | pg_cron no Supabase (job `dmflow-tick`, 1 min) chamando `/api/cron/tick` |
| Backup de cron | `vercel.json`, diário às 03h (limite do plano Hobby) |
| Conta conectada | @nocodepedro (BUSINESS), token de 60 dias, renovado pelo tick |
| Conta dev Meta | Ana Luiza Rezende (`alrmartins@yahoo.com.br`) — decisão do dono |
| Facebook App | `dm-flow`, ID `1300921041880198`, dono BM Ghostmoney, publicado |
| Instagram App | `dm-flow-IG`, ID `2815946815447454` — **credenciais próprias, ≠ Facebook App** |
| Webhook callback | `https://dm.nocodepedro.site/api/webhooks/instagram` |

As linhas acima vêm do HANDOFF anterior e da configuração feita à mão na Meta — **nada disso é
verificável a partir do código**. Confira antes de agir sobre qualquer uma.

O app do Instagram tem credenciais separadas das de Configurações → Básico do Facebook App;
aquelas são do Facebook App e **não funcionam** no login com Instagram. Em modo de
desenvolvimento, a conta só autoriza se tiver a função **Testador do Instagram** e aceitar o
convite em Instagram → Configurações → Apps e sites → Convites do testador.

Comandos de operação úteis:

```bash
# o cron está rodando? (SQL Editor do Supabase)
select status, start_time from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'dmflow-tick')
  order by start_time desc limit 5;

# tick manual
curl "https://dm.nocodepedro.site/api/cron/tick?secret=<CRON_SECRET>"

# assinaturas de webhook no nível do APP (APP_SECRET = o do FACEBOOK App)
curl "https://graph.facebook.com/v23.0/1300921041880198/subscriptions?access_token=1300921041880198%7C<APP_SECRET>"

vercel logs dm.nocodepedro.site --cwd ~/projects/dm-flow
vercel env ls --cwd ~/projects/dm-flow
```

---

## 8. Pendências

1. **Rotacionar o App Secret do Instagram.** Auditoria de 30/07: o token do Supabase (`sbp_…`) e
   as duas chaves do Tailscale foram revogados e confirmados com 401. Falta o App Secret, que só
   o dono rotaciona (nada de automação em site da Meta). Ele fica no app **`dm-flow-IG`**, em
   Instagram → Configuração da API com login do Instagram → "Chave secreta do app do Instagram"
   — **não** em Configurações → Básico. Depois de redefinir, atualizar `INSTAGRAM_APP_SECRET` na
   Vercel e no `.env.local`, e **redeploy**.
   Impacto: nenhum na automação em curso. O refresh do token não usa o secret (confirmado em
   `oauth.ts`: `refreshLongLivedToken` manda só `grant_type` e `access_token`). O secret só afeta
   a validação de assinatura do webhook (que não entrega) e a troca de code no OAuth.
   Nunca vazaram: o token de acesso do Instagram e a `service_role` do Supabase.

2. **URI de OAuth de produção** (`https://dm.nocodepedro.site/api/auth/instagram/callback`) nas
   configurações do login da empresa na Meta. Só importa para reconectar a conta.

3. **Migrations: 0001–0015 aplicadas e conferidas contra o banco em 01/08.** O processo é manual
   (não há CLI nem `psql` na máquina; cola-se no SQL Editor). Como nada registra o que rodou além
   do próprio banco, **migration aplicada é estado fora do repositório** — antes de confiar numa
   tela nova, confirme que a tabela existe.

4. **A automação `mapa` está ATIVA e manda um link que devolve 404.** `https://nocodepedro.site/mapa`
   não existe. Quem comenta recebe a DM e cai no nada — está perdendo lead agora. É o argumento
   mais forte a favor da feature 1 (`docs/maestri/01-entrega.md`): entrega hospedada por nós não
   tem como apontar para o vazio.

5. **Trocar o token da Apify.** Foi colado no chat durante o desenvolvimento. Está em
   `APIFY_TOKEN`, na Vercel e no `.env.local`.

6. **O fluxo "Presente com follow" (palavra-chave `aula`) está pausado.** Foi montado em 01/08 com
   a condição nova, e nunca rodou com gente de verdade.

7. **Rodar o gerador de roteiro uma vez.** Zero linhas em `scripts` — é a única parte da biblioteca
   que nunca foi exercitada.

8. **Importar o resto dos perfis curados.** 4 dos 31 estão rastreados. O botão de importar a lista
   só aparece quando não há perfil nenhum (`ProfileManager`) — vale mover para fora do estado
   vazio, que é exatamente o bug que já aconteceu uma vez ali.

9. **Backlog de produto** está no `ROADMAP.md`. Em resumo: múltiplas contas (o schema já isola
   por `account_id`, falta o seletor), segmentos salvos e broadcast segmentado — este último por
   último e com trava, pelos motivos da seção 4.1.

---

## 9. Mapa do código

```
src/app/(app)/              páginas do painel; o layout monta a navegação do topo
  page.tsx                    cockpit: falhas, gente esperando, travados, tendência, risco
  automacoes/[id]/            editor + canvas do fluxo
  automacoes/[id]/metricas/   funil por bloco, cliques por botão, curvas de 30 dias
  biblioteca/                 acervo raspado, ranking por outlier, gerador de roteiro
  contatos/ conversas/ ice-breakers/
src/app/login/              login por senha
src/app/privacidade/        exigência da Meta para publicar o app
src/app/api/                webhooks/instagram · auth/instagram(+callback) · cron/tick ·
                            conversao · contatos/export · busca · instagram/media
src/proxy.ts                auth global (o Middleware do Next 16 chama-se Proxy)

src/lib/webhook/poll.ts     A VARREDURA — é o que entrega de fato
src/lib/webhook/process.ts  fila, dedup, claim, retentativa, roteamento de evento
src/lib/flow/engine.ts      state machine: caminha, entrega, dorme, retoma
src/lib/flow/types.ts       schema Zod dos nós + limites da Meta (bytes × caracteres)
src/lib/flow/variation.ts   trava anti-spam de variação
src/lib/flow/leaks.ts       onde o fluxo perde gente (puro, roda no servidor e no browser)
src/lib/flow/send-cap.ts    caps; falha fechado
src/lib/instagram/api.ts    envio, corte de tamanho, ice breakers, assinatura de webhook
src/lib/instagram/errors.ts permanente × transitório
src/lib/risk/               cinco sinais + veredito, todos puros e testados
src/lib/library/scrape.ts   orçamento de tempo, retomada, custo por resultado
src/lib/library/ingest.ts   parse da Apify, mediana por perfil, multiplicador de outlier
src/lib/library/thumbs.ts   cópia das capas para o nosso Storage (o CDN da Meta derruba rajada)
src/lib/ai/                 schemas Zod do roteiro; chamada direta à Anthropic com fetch
src/lib/data.ts             leitura para o painel (server-only)
supabase/migrations/        0001..0015, todas aplicadas à mão no SQL Editor
scripts/                    diagnóstico fora do app (raspagem, capas, recálculo de mediana)
docs/maestri/               trabalho em fila, escrito para um agente executar
```

---

## 10. O que vem a seguir

Duas features, especificadas em `docs/maestri/`, ambas fechando o mesmo laço: **hoje a biblioteca
escreve o roteiro e a automação entrega o presente, mas as duas metades não se conhecem.**

1. **`01-entrega.md` — o presente nasce junto do roteiro.** O gerador passa a produzir também o
   material prometido, publicado numa página nossa, cuja URL a automação dispara. Mata a classe
   inteira de bug do link 404 e fecha o funil: comentou → DM → clicou → abriu.
2. **`02-insights.md` — os insights do post voltam para quem escreveu.** Métricas da Meta
   (incluindo `follows`, os seguidores que aquele vídeo trouxe) cruzadas com o funil que só nós
   temos: quantos comentaram, viraram DM, clicaram, seguiram, abriram o presente.

Leia `docs/maestri/00-contexto.md` antes das duas — é o que impede um agente de quebrar um
invariante sem saber que existia.
