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
supabase/            migrations/0001_init.sql, seed.sql (fluxo de exemplo)
```

## Invariantes — quebrar isso quebra a automação

- **Webhook responde 200 sempre e rápido.** Erro vai para log e fila, nunca para o status HTTP.
  A Meta desativa webhook que falha demais.
- **A assinatura é validada sobre o corpo cru** (`request.text()`). Reserializar o JSON quebra o HMAC.
- **`is_echo` é descartado.** Sem isso o bot responde às próprias mensagens em loop.
- **Janela de 24h**: DM comum só dentro dela. Só a private reply (de comentário) escapa,
  e só uma vez por comentário.
- **Comentário não seta `last_inbound_at`** — comentar não abre a janela de DM.
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

## Autenticação

`src/proxy.ts` (o Middleware do Next 16 chama-se Proxy) tranca tudo atrás de `PANEL_PASSWORD`,
com sessão em cookie assinado por HMAC. As exceções em `PUBLIC_PATHS` são obrigatórias — a Meta
e o cron não fazem login — e cada uma tem autenticação própria (HMAC, `state`, `CRON_SECRET`).
**Não adicione rota nova a `PUBLIC_PATHS` sem uma dessas defesas.**

As páginas do painel vivem em `src/app/(app)/`, que é onde mora a sidebar. `/login` e
`/privacidade` ficam fora do grupo de propósito.

## Convenções

Código em inglês, textos de UI em português. Arquivos em `kebab-case`.
`supabaseAdmin` e `env` são Proxies lazy — não os transforme em constantes avaliadas no import,
senão `next build` passa a exigir `.env`.

## Antes de dizer que terminou

```bash
npx tsc --noEmit && npm run lint && npm run build
```
