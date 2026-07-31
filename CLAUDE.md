@AGENTS.md

# dm-flow

Automação de DM/comentário do Instagram (clone do núcleo do ManyChat). Uso próprio, single-tenant.
Leia o `README.md` antes de mexer — ele explica as regras da Meta que moldam a arquitetura.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind 4 · Supabase (service_role) · Zod 4

## Mapa

```
src/lib/instagram/   oauth.ts (login + token), api.ts (envio), signature.ts (HMAC do webhook)
src/lib/flow/        types.ts (schema Zod dos nós), engine.ts (state machine), triggers.ts (matcher)
src/lib/webhook/     process.ts (fila + roteamento de evento)
src/app/api/         webhooks/instagram, auth/instagram(+callback), cron/tick
supabase/            migrations/0001..0013, seed.sql (fluxo de exemplo)
src/lib/series.ts    agrupamento em balde de dia/hora (puro), alimenta os gráficos
src/components/ui/   index.tsx (primitivos), chart.tsx (BigNumber, Meter, RankBars, TimeSeries)
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
  `{a|b}` aplicado em todo texto de envio, jitter de 30–120s em evento de comentário
  (`process_after` na fila) e cap de envios/hora (`send_log` + `SEND_HOURLY_CAP`; estourou
  = fluxo dorme 5 min e retenta sozinho). Resposta idêntica e instantânea em volume é o que
  o filtro de spam do Instagram derruba. Não remova nenhuma das três camadas.
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
- **O OAuth tem que começar e terminar no mesmo domínio.** O `state` vive num cookie; iniciar
  em `localhost` com `redirect_uri` apontando para o túnel dá `state-invalido`. Sempre acesse
  o app pela URL pública.

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

As páginas do painel vivem em `src/app/(app)/`, que é onde mora a sidebar. `/login` e
`/privacidade` ficam fora do grupo de propósito.

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
suba o código que depende dela.

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

`vitest`, arquivos `*.test.ts` ao lado do código. Cobrem o que quebra em silêncio:
spintax, validação de resposta do bloco `ask`, horário de silêncio, matcher de gatilho,
schema dos nós e o caminho do `ask` no engine (com Supabase e Instagram simulados).

Bloco novo no fluxo → adicione o caso em `types.test.ts`. Mexeu no `engine.ts` →
`engine.test.ts` tem que continuar verde; ele existe justamente porque essa lógica
falha sem erro visível.
