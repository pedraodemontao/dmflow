@AGENTS.md

# dm-flow

Automação de DM/comentário do Instagram (clone do núcleo do ManyChat). Uso próprio, single-tenant.
Leia o `README.md` antes de mexer — ele explica as regras da Meta que moldam a arquitetura.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind 4 · Supabase (service_role) · Zod 4

## Mapa

```
src/lib/instagram/   oauth.ts (login + token), api.ts (envio + corte de tamanho),
                     errors.ts (permanente × transitório), signature.ts (HMAC), health.ts
src/lib/flow/        types.ts (schema Zod dos nós + META_LIMITS), engine.ts (state machine),
                     triggers.ts (matcher), variation.ts (trava anti-spam),
                     send-cap.ts (caps), leaks.ts (onde o fluxo perde gente),
                     button-source.ts (título ↔ payload), transform.ts (canvas ↔ JSON)
src/lib/webhook/     poll.ts (A VARREDURA — é o que entrega), process.ts (fila + roteamento)
src/lib/risk/        cinco sinais puros + assess.ts (veredito)
src/lib/library/     scrape.ts (orçamento de tempo + retomada), ingest.ts (mediana por perfil,
                     multiplicador de outlier), thumbs.ts (cópia das capas — o CDN da Meta
                     derruba rajada com 503)
src/lib/ai/          schemas Zod do roteiro; chamada direta à Anthropic com fetch, sem AI SDK
src/app/api/         webhooks/instagram, auth/instagram(+callback), cron/tick, conversao
supabase/            migrations/0001..0015, seed.sql (fluxo de exemplo)
docs/maestri/        trabalho em fila, escrito para agente executar (00-contexto é obrigatório)
src/lib/series.ts    agrupamento em balde de dia/hora (puro), alimenta os gráficos
src/components/ui/   index.tsx (primitivos), chart.tsx (BigNumber, Meter, RankBars,
                     TimeSeries, LineSeries)
```

## Invariantes — quebrar isso quebra a automação

- **Webhook responde 200 sempre e rápido.** Erro vai para log e fila, nunca para o status HTTP.
  A Meta desativa webhook que falha demais.
- **A assinatura é validada sobre o corpo cru** (`request.text()`). Reserializar o JSON quebra o HMAC.
- **`is_echo` é descartado.** Sem isso o bot responde às próprias mensagens em loop.
- **Janela de 24h**: DM comum só dentro dela. Só a private reply (de comentário) escapa,
  e só uma vez por comentário.
- **Comentário não seta `last_inbound_at`** — comentar não abre a janela de DM.
  **Clique em botão postback seta.** É o que destrava fluxo de várias mensagens a partir de
  comentário: a private reply leva botão, o toque abre a janela, e daí a conversa é livre.
  Por isso `deliver()` nunca pode descartar `payload.buttons` quando há `pendingCommentId`.
- **`dedup_key` em `webhook_events`** é o que impede processar duas vezes. A Meta reentrega.
- **Webhook exige DUAS assinaturas independentes.** No app (`POST /{app-id}/subscriptions`, com o
  App Secret do *Facebook* App) e na conta (`POST /me/subscribed_apps`, com o token da conta).
  Cadastrar a URL na interface não assina campo nenhum. Faltando qualquer uma delas a Meta não
  entrega nada e o app fica mudo — sem erro, sem log, sem pista. O callback do OAuth já cuida da
  parte da conta; não remova. Veja o README para o comando da parte do app.
- **`MAX_STEPS` no engine** é a trava contra fluxo que cicla sozinho. Não remova.
- **Blindagem anti-spam é invariante** (custou restrição de conta em jul/2026): spintax
  `{a|b}` aplicado em todo texto de envio, jitter em evento de comentário (`process_after` na
  fila — **8–35 s hoje**; nasceu 30–120 s e foi reduzido depois de teste com lead real, porque
  o que o filtro pune é resposta imediata e sempre igual, não resposta em 20 segundos — o
  cabeçalho da migration 0002 ainda diz 30–120 s e está desatualizado) e cap de envios/hora
  (`send_log` + `SEND_HOURLY_CAP`; estourou = fluxo dorme 5 min e retenta sozinho). Resposta
  idêntica e instantânea em volume é o que o filtro de spam do Instagram derruba. Não remova
  nenhuma das três camadas.
- **O cap falha fechado.** Erro ao consultar `send_log` conta como cap estourado
  (`src/lib/flow/send-cap.ts`). Banco fora do ar não pode virar licença para disparar sem trava.
- **Variação é obrigatória para ativar.** `saveAutomation` recusa ativar automação cuja
  resposta pública tenha menos de 3 variantes de spintax, ou cujo texto de fluxo tenha menos
  de 2 (`src/lib/flow/variation.ts`). Não é preferência de estilo: texto único repetido é
  exatamente o padrão que o filtro pega.
- **Todo comentário é respondido, nem que demore.** Comentário acima do cap por post vai para
  `pending_public_replies` e o tick drena no ritmo seguro — nunca é descartado. A DM continua
  instantânea; só a resposta pública espera.
- **A varredura é por cursor, não por janela fixa.** `comments_cursor` / `messages_cursor` em
  `accounts`, com `CURSOR_OVERLAP_MS` de sobreposição e paginação (`src/lib/webhook/poll.ts`).
  Sem isso, comentário que chega durante uma queda do cron some para sempre.
- **Tick que falhou responde 503.** Erro de polling não pode terminar em 200: o cron do
  Supabase é a única coisa que avisa que a automação parou.
- **`enqueue()` lança, e é contrato.** `upsert()` do supabase-js resolve com `{ error }` em vez
  de lançar; com o retorno ignorado, o cursor avançava por cima de comentários que nunca
  entraram na fila e o tick respondia `ok:true`. Retorno se ignora por acidente, exceção não.
  Quem chama tem duas saídas legítimas: deixar subir (polling → cursor não avança, tick 503) ou
  capturar de propósito (webhook → loga e responde 200 assim mesmo).
- **Erro permanente não retenta, e run morto retoma de onde parou.** `send()` devolve
  `MetaSendError` com código e subcódigo; o desconhecido cai em **transitório** de propósito.
  E `startFlow` retoma run `failed` com `current_node` em vez de criar um novo — recomeçar do
  `entry` reentregava TODA mensagem já enviada antes da falha, que é o mesmo padrão de
  repetição que restringiu a conta.
- **Tudo que envia precisa de claim otimista.** `maxDuration` é 300 s e o cron dispara a cada
  60 s, então até cinco ticks convivem. `webhook_events`, `pending_public_replies`, o run
  `sleeping` e o run `failed` retomado têm claim condicionado ao status anterior. Sem claim,
  dois ticks percorrem o mesmo run e a Meta aceita as duas DMs sem reclamar.
- **Adiar não é falhar.** Cap estourado, pânico ligado e horário de silêncio devolvem a
  tentativa e usam `continue` — nunca caem no catch que incrementa `attempts`. Com o cap dentro
  do `try`, cinco ticks em rajada levavam a fila inteira ao teto de tentativas e ela sumia da
  consulta para sempre.
- **A interpolação roda ANTES do spin.** É o que faz `{Oi {{nome}}|E aí {{nome}}}` funcionar no
  envio — e é por isso que `variantCount`/`splitVariations` mascaram `{{variavel}}` antes de
  olhar para os grupos. Validador que mede o template cru rejeita texto que funciona.
- **Limite da Meta estourado recusa a MENSAGEM INTEIRA** (erro 100) e mata o `flow_run` no meio.
  Duas defesas: o schema mede a **maior expansão** do spintax (medir o template cru rejeitaria
  texto legítimo), e o envio **corta em vez de lançar**, por code point — `slice` parte o par
  substituto do emoji e produz UTF-8 inválido, que a Meta recusa igual. Texto de DM é 1000
  BYTES; button template é 640 CARACTERES. São réguas diferentes.
- **Anexo não cabe em private reply.** Bloco de mídia nascido de comentário manda a legenda e
  para em `waiting_reply` no próprio nó; o anexo só sai depois que a pessoa responde ou toca num
  botão e a janela abre. Mandar o anexo como DM comum ali dá "outside of allowed window" e
  derruba o fluxo inteiro.
- **Toque em botão chega diferente conforme o canal**: pelo webhook vem o `payload`, pelo
  polling vem o TÍTULO. `payloadForText` traduz lendo as definições da conta e recusa traduzir
  quando o mesmo título aponta para payloads diferentes. Sem isso, condição escrita contra o
  payload pega o caminho errado em silêncio.
- **A versão da Graph API na URL do polling é parte da correção.** De 3.2 em diante a edge de
  comentários devolve do mais novo para o mais antigo — é só isso que faz "20 páginas × 25"
  significar os 500 comentários MAIS RECENTES. Baixar a versão faz o post viral ficar
  permanentemente mudo, sem erro e sem log.
- **O OAuth tem que começar e terminar no mesmo domínio.** O `state` vive num cookie; iniciar
  em `localhost` com `redirect_uri` apontando para o túnel dá `state-invalido`. Sempre acesse
  o app pela URL pública.
- **Na biblioteca, o outlier é medido sobre PLAYS.** O Instagram devolve dois contadores para o
  mesmo vídeo — `videoViewCount` (4.719) e `videoPlayCount` (112.806). Trocar os dois muda o
  multiplicador por um fator de 20. E o divisor é a mediana **do próprio autor**: comparar
  perfis entre si não diz nada, porque a base de seguidores é outra.
  **No perfil do dono a fonte é outra e isso é deliberado**: a Graph API não devolve
  `playCount`, então `own-plays.ts` grava o `views` dela em `plays`. Fecha porque o outlier é
  uma razão dentro do mesmo perfil — numerador e denominador saem da mesma régua. O que a
  troca proíbe é comparar `plays` do dono com o de terceiro em número absoluto, que já era
  proibido antes, agora por dois motivos.
- **Item sem medição não entra na mediana.** `plays = 0` quase nunca significa "foi mal":
  significa que a Apify omitiu `videoPlayCount` ou que o tick nunca alcançou aquela mídia
  (`media_insights` cobre as dez mais recentes e as com automação, não o acervo). Contá-los
  como zero derrubava a mediana a zero, e mediana zero faz `outlierScore` devolver `null`
  para o perfil INTEIRO — 39 dos 49 vídeos do dono zeravam a régua dos outros 10.
- **Valor derivado não entra em coluna `bigint`.** Mediana de um número par de vídeos tem `.5`,
  o Postgres recusa, e o perfil fica **sem régua nenhuma** — nenhum vídeo dele ganha
  multiplicador. Aconteceu em 01/08 e passou despercebido porque o erro ia para o array
  `errors` da raspagem. **Erro que vai para uma lista em vez de subir é erro que não existe.**
- **Capa de post é copiada, nunca linkada.** O navegador pede as dez capas de uma vez e o CDN da
  Meta derruba oito com 503 — medido no log de rede; não é referrer nem formato de URL, é
  rajada. Some a expiração da URL assinada e hotlink deixa de ser opção (`library/thumbs.ts`).

## Setup na Meta (já feito, para referência)

App `dm-flow` ID `1300921041880198`, dono BM Ghostmoney. O produto Instagram cria um **app do
Instagram separado** (`dm-flow-IG`, ID `2815946815447454`) com credenciais próprias — as de
Configurações → Básico são do Facebook App e **não funcionam** no login com Instagram.

Em modo de desenvolvimento, a conta só autoriza se tiver a função **Testador do Instagram**
(Funções do app → Mais → Testadores do Instagram) **e** aceitar o convite em
Instagram → Configurações → Apps e sites → Convites do testador. Sem isso o OAuth falha com
"Função de desenvolvedor é insuficiente".

**Trocar a senha do Facebook invalida o token do Instagram.** Aconteceu em 30/07/2026 e deixou
a automação morta por 22 horas sem nenhum sinal além de `OAuthException code 1` nos `flow_runs`.
Depois de qualquer mexida em senha ou segurança da conta, reconecte pelo painel.

**Nunca use automação de navegador em site da Meta** (developers.facebook.com,
business.facebook.com, facebook.com, instagram.com) com a sessão logada — foi isso que
disparou a restrição de jul/2026. Chamada à Graph API por `curl` é aceitável, com parcimônia.

## Autenticação

`src/proxy.ts` (o Middleware do Next 16 chama-se Proxy) tranca tudo atrás de `PANEL_PASSWORD`,
com sessão em cookie assinado por HMAC. As exceções em `PUBLIC_PATHS` são obrigatórias — a Meta
e o cron não fazem login — e cada uma tem autenticação própria (HMAC, `state`, `CRON_SECRET`).
**Não adicione rota nova a `PUBLIC_PATHS` sem uma dessas defesas.**

As páginas do painel vivem em `src/app/(app)/`, cujo layout monta a navegação do topo
(`src/components/layout/top-nav.tsx` — a sidebar foi removida na direção visual "Marcador").
`/login` e `/privacidade` ficam fora do grupo de propósito.

## Métrica: qual tabela responde o quê

- **`flow_node_events`** conta PASSAGEM por bloco. É o funil. Uma linha por
  contato por nó visitado.
- **`button_clicks`** conta ESCOLHA. Tabela separada de propósito: linha de
  clique dentro de `flow_node_events` inflaria o funil, com a mesma pessoa
  aparecendo duas vezes no mesmo nó.
- **`send_log`** é o cap e o gráfico de envios por hora. Não é histórico de
  mensagem — isso é `messages`.
- Toda escrita de métrica é disparada sem `await` bloqueante, com erro indo
  para `console.error`. Métrica é acessório; entrega não. É também o que faz o
  código sobreviver a uma tabela que ainda não existe no banco.

## Migration

Não há CLI nem `psql` na máquina: a migration é colada no SQL Editor do
Supabase, na ordem dos arquivos. Escreva o arquivo, avise o dono, e só então
suba o código que depende dela. Como nada registra o que já rodou além do
próprio banco, **migration aplicada é estado fora do repositório**: antes de
confiar numa tela nova, confirme que a tabela existe.

## Ambiente

**Não existe staging.** `npm run dev` lê o `.env.local`, que aponta para o
banco de PRODUÇÃO — subir o servidor local mexe nos mesmos dados e um tick
manual dispara DM de verdade. Para trabalho de código,
`npx tsc --noEmit && npm run lint && npm test` cobre quase tudo sem servidor.

Não há `.env.example` versionado (`.gitignore` bloqueia `.env*`). A lista real
de variáveis é o schema Zod de `src/lib/env.ts`, documentada no README.

## Convenções

Código em inglês, textos de UI em português. Arquivos em `kebab-case`.
`supabaseAdmin` e `env` são Proxies lazy — não os transforme em constantes avaliadas no import,
senão `next build` passa a exigir `.env`.

## Antes de dizer que terminou

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

O CI (`.github/workflows/ci.yml`) roda exatamente esses quatro em toda branch.

## Testes

`vitest`, arquivos `*.test.ts` ao lado do código — 27 deles. Cobrem o que quebra em silêncio:
spintax e trava de variação, validação de resposta do bloco `ask`, horário de silêncio, matcher
de gatilho, schema dos nós e limites da Meta, classificação de erro da Meta, tradução
título ↔ payload, análise de vazamento do fluxo, os cinco sinais de risco, o balde das séries,
o polling e o roteamento de evento, e os caminhos do engine (com Supabase e Instagram
simulados).

Bloco novo no fluxo → adicione o caso em `types.test.ts`. Mexeu no `engine.ts` →
`engine.test.ts` e `engine-blocks.test.ts` têm que continuar verdes; eles existem justamente
porque essa lógica falha sem erro visível.

**Cuidado com teste que codifica bug.** Os testes do bloco de mídia garantiam o comportamento
antigo — legenda pela private reply e anexo como DM comum — que era exatamente o bug que matava
todo fluxo de comentário com mídia. Quando um teste impede a correção, o teste é que está
errado; verifique por mutação antes de confiar nele.
