# HANDOFF — dm-flow

> Estado em 2026-07-29 (noite). Sistema **em produção e funcionando**.
> Retomar por aqui; detalhes técnicos no `README.md` e regras no `CLAUDE.md`.

---

## O que é

Clone self-hosted do núcleo do ManyChat para Instagram: comentário com palavra-chave → resposta pública + DM automática → fluxo visual (botões, condições, delays, tags, webhook externo). Dashboard com seletor de posts e builder de fluxo em canvas.

**Testado de ponta a ponta com dado real**: comentário "mapa" de @opedrobarros_ → resposta pública + private reply + DM do fluxo montado no builder. `{{nome}}` interpolando.

---

## Produção (roda 24h, sem o Mac)

| Item | Valor |
|---|---|
| Painel | `https://dm.nocodepedro.site` (senha: ver `.env.local`, seção PRODUÇÃO) |
| Hospedagem | Vercel — projeto `dm-flow`, conta `barroslab` |
| Banco | Supabase `dm-flow` ref `xbiebyteiaambworezyi` (org Ghost Money, sa-east-1) |
| Agendador | **pg_cron no Supabase** (job `dmflow-tick`, a cada 1 min) → chama `/api/cron/tick` na Vercel |
| Backup de cron | vercel.json, diário 03h (Hobby não permite mais que isso) |
| Conta conectada | @nocodepedro (BUSINESS), token até 2026-09-27, renova sozinho |

### Como o disparo funciona (IMPORTANTE)

**Por POLLING, não por webhook.** O webhook da Meta nunca entregou (diagnóstico completo abaixo). A cada minuto o tick varre comentários (`/{media}/comments`) e DMs (`/me/conversations`) e alimenta a mesma fila (`webhook_events`). O `dedup_key` (`comment:<id>` / `msg:<mid>`) torna polling e webhook idempotentes — se a Meta um dia entregar, nada duplica. Latência: até ~1 min.

---

## Meta (apps e contas)

| Item | Valor |
|---|---|
| Conta dev Meta | **Ana Luiza Rezende** (`alrmartins@yahoo.com.br`) — decisão do Pedro, ele usa esse perfil |
| Facebook App | `dm-flow` ID `1300921041880198`, dono BM Ghostmoney, **Publicado** |
| Instagram App | `dm-flow-IG` ID `2815946815447454` — credenciais próprias (≠ Facebook App!) |
| Webhook callback | `https://dm.nocodepedro.site/api/webhooks/instagram`, verify token em `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` |
| Testador | @nocodepedro (convite aceito) |

### A armadilha das 3 assinaturas (custou horas — NUNCA esquecer)

Webhook do Instagram exige TRÊS coisas e **nenhuma dá erro quando falta** (fica mudo):
1. **Assinatura no APP**: `POST /{fb-app-id}/subscriptions` com token `{app_id}|{app_secret}` do **Facebook** App. A UI não mostra nem cria isso. Conferir: `GET .../subscriptions` — `{"data":[]}` = problema.
2. **Assinatura na CONTA**: `POST /me/subscribed_apps` com token da conta (automático no callback do OAuth).
3. **App publicado** (exige URL de política de privacidade → servida em `/privacidade`).

Mesmo com as 3 ativas (`active: true`), a entrega nunca aconteceu → por isso o polling. Hipóteses: propagação ou bug da Meta. Irrelevante enquanto o polling roda.

---

## Rodar localmente (desenvolvimento)

```bash
cd ~/projects/dm-flow
npm run dev                    # sobe na 3001 (3000 vive ocupada)
# validar antes de dizer que terminou:
npx tsc --noEmit && npm run lint && npm run build
```

Para testar OAuth/webhook local: `tailscale funnel --bg 3001` (URL fixa
`macbook-air-de-pedro.tailfa5da9.ts.net`; desliga com `tailscale funnel --https=443 off`).
⚠️ Acessar o app **sempre pela URL pública** (cookie de `state` do OAuth quebra se começar em localhost). ⚠️ Funnel aberto = bots varrendo em minutos; fechar quando não usar.

---

## Comandos de operação

```bash
# cron está rodando? (SQL no Supabase, via painel ou API)
select status, start_time from cron.job_run_details
  where jobid=(select jobid from cron.job where jobname='dmflow-tick')
  order by start_time desc limit 5;

# tick manual (CRON_SECRET de produção está na Vercel)
curl "https://dm.nocodepedro.site/api/cron/tick?secret=<CRON_SECRET>"

# assinaturas da Meta (APP_SECRET = Chave Secreta do Aplicativo, Config → Básico)
curl "https://graph.facebook.com/v23.0/1300921041880198/subscriptions?access_token=1300921041880198%7C<APP_SECRET>"

# logs da Vercel
vercel logs dm.nocodepedro.site --cwd ~/projects/dm-flow

# envs de produção
vercel env ls --cwd ~/projects/dm-flow
```

---

## Pendências

1. **Rotacionar chaves que passaram pelo chat da sessão de 2026-07-29** (auditado em 2026-07-30):
   - ✅ Token Supabase (`sbp_...`, chamado "claude"): revogado, confirmado 401.
   - ✅ Keys Tailscale: auth key "manychat" e API key "claude" revogadas via API, confirmado 401.
     Revogar auth key não desconecta máquina já registrada.
   - ⏳ **App Secret do Instagram** — pendente, só o Pedro faz (nada de automação em site da Meta).
     Fica no app **`dm-flow-IG` (`2815946815447454`)**, em Instagram → Configuração da API com
     login do Instagram → "Chave secreta do app do Instagram". **Não** é Configurações → Básico:
     aquele é o secret do Facebook App e não é o que o código usa. Depois de redefinir, atualizar
     `INSTAGRAM_APP_SECRET` na Vercel (Settings → Environment Variables) e no `.env.local`,
     e **redeploy** para valer.
     Impacto: nenhum na automação em curso — o refresh do token não usa o secret (`oauth.ts`).
     Só afeta validação de assinatura do webhook (que não entrega, o disparo é por polling) e
     reconexão de conta via OAuth.
   - Nunca vazaram: token de acesso do Instagram e a `service_role` do Supabase (auditado).
   - Senha antiga do painel local já não vale em produção.
2. **URI de OAuth de produção** (`https://dm.nocodepedro.site/api/auth/instagram/callback`) nas
   Configurações do login da empresa (Meta → Instagram → seção 4). Só importa para reconectar conta.
3. **Backlog de produto**: pausar/duplicar automação no painel · métricas por fluxo · multi-conta ·
   encurtar intervalo do polling se 1 min incomodar.

---

## Mapa do código

```
src/app/(app)/          páginas do painel (dashboard, automações, contatos, conversas)
src/app/login/          login por senha (PANEL_PASSWORD)
src/app/privacidade/    política de privacidade (exigência da Meta)
src/proxy.ts            auth global (Middleware do Next 16 = "Proxy")
src/components/automacoes/  post-picker, flow-builder (canvas), node-inspector, editor
src/lib/flow/           types (Zod), engine (state machine), triggers, transform (canvas↔JSON)
src/lib/instagram/      oauth, api (envio + subscribe), signature (HMAC)
src/lib/webhook/        process (fila + roteamento), poll (POLLING — o que entrega de fato)
supabase/               migrations + seed
```

Regras invioláveis e armadilhas: `CLAUDE.md`. Setup do zero e troubleshooting: `README.md`.
