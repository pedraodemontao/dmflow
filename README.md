# dm-flow

Automação de DM e comentário do Instagram. O núcleo do ManyChat, self-hosted.

Faz: comentário com palavra-chave → DM automática, palavra-chave na DM → fluxo, resposta de story → fluxo, ice breakers publicados na conta, tags, delays, condições, chamada de webhook externo.

---

## Como funciona

```
Instagram
   │  webhook (mensagem ou comentário)
   ▼
/api/webhooks/instagram      valida assinatura → grava na fila → 200 em ~50ms
   │  after()
   ▼
processPending()             acha a conta, o contato e o gatilho
   │
   ▼
engine.ts                    caminha pelos nós do fluxo até pausar ou terminar
   │
   ▼
Instagram Graph API          manda a DM (ou private reply, se veio de comentário)
```

O cron (`/api/cron/tick`, a cada 5 min) faz o resto: retoma fluxos que estavam em nó de
`delay`, recolhe evento que travou, e renova o token antes de vencer.

---

## Regras da Meta que moldam tudo

| Regra | Consequência no código |
|---|---|
| **Janela de 24h** — só pode mandar DM até 24h depois da última mensagem do contato | `canSendDm()` no `engine.ts` checa `contacts.last_inbound_at` |
| **Private reply** — DM a partir de comentário, 1x por comentário, até 7 dias | `ctx.pendingCommentId`: a primeira mensagem do fluxo sai como private reply |
| **Comentário não abre a janela de DM** | `markInbound: false` no `upsertContact` do comentário |
| **Webhook precisa de 200 rápido** | fila em `webhook_events` + `after()` |
| **A Meta reentrega eventos** | `dedup_key` único (`msg:<mid>` / `comment:<id>`) |
| **Echo** — a Meta te devolve as mensagens que você mesmo mandou | `if (value.message?.is_echo) return` |
| **Token longo vence em 60 dias** | cron renova faltando 10 dias |
| **Webhook exige DUAS assinaturas independentes** | app (`POST /{app-id}/subscriptions`) **e** conta (`POST /me/subscribed_apps`). Faltando qualquer uma, nada chega — e sem erro |

---

## Setup

### 1. Supabase

Crie o projeto e rode a migration no SQL Editor:

```
supabase/migrations/0001_init.sql
```

Pegue `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` em **Project Settings → API**.

> RLS está ligada em todas as tabelas e **sem policy**. Só a `service_role` escreve.
> É o certo enquanto não existe login de usuário. Quando existir, adicione `owner_id` + policies.

### 2. Meta Developer App

1. [developers.facebook.com](https://developers.facebook.com/apps) → **Create App** → tipo **Business**
2. Adicione o produto **Instagram** → **API setup with Instagram login**
3. Em **Business login settings**:
   - **Redirect URI**: `https://SEU-DOMINIO/api/auth/instagram/callback`
   - Permissões: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`
4. Copie o **ID do app do Instagram** e a **Chave secreta do app do Instagram** — ficam na
   própria tela do produto Instagram, **não** em App settings → Basic (aqueles são do
   Facebook App e não servem para o login com Instagram)
5. A conta do Instagram precisa ser **profissional** (Business ou Creator) e ter
   **Ferramentas de mensagens conectadas** ativado (Instagram → Configurações → Mensagens)

> **Modo de desenvolvimento**: o app funciona nas suas próprias contas sem App Review.
> Para conectar conta de terceiro é obrigatório App Review + Business Verification.

### 3. Webhook — a parte que mais engana

Receber eventos exige **três** coisas, e faltando qualquer uma o app fica mudo, sem erro nenhum:

**a) Assinatura no nível do APP.** Cadastrar a URL na interface **não** assina os campos — a UI
nova da Meta nem mostra essa lista. Confira e crie pela API:

```bash
APP_ID=...        # ID do Facebook App (não o do Instagram)
APP_SECRET=...    # Chave Secreta do Aplicativo, em Configurações → Básico

# conferir (se voltar {"data":[]}, é esse o problema)
curl "https://graph.facebook.com/v23.0/$APP_ID/subscriptions?access_token=$APP_ID%7C$APP_SECRET"

# assinar
curl -X POST "https://graph.facebook.com/v23.0/$APP_ID/subscriptions" \
  -d "object=instagram" \
  -d "callback_url=https://SEU-DOMINIO/api/webhooks/instagram" \
  -d "fields=comments,messages,messaging_postbacks" \
  -d "verify_token=SEU_VERIFY_TOKEN" \
  -d "access_token=$APP_ID|$APP_SECRET"
```

**b) Assinatura no nível da CONTA.** Já automática no callback do OAuth (`subscribeToWebhooks`).
Confira com `GET /me/subscribed_apps` usando o token da conta.

**c) App publicado.** Em "Publicar" → botão **Publicar**. Exige URL de política de privacidade
preenchida (este projeto serve uma em `/privacidade`). Não exige App Review.

A Meta só aceita HTTPS. Em desenvolvimento local é preciso um túnel — e a escolha do túnel
importa mais do que parece:

```bash
# Recomendado: URL fixa, não cai, HTTPS válido.
tailscale funnel --bg 3001
# Habilite o Funnel uma vez no tailnet quando o CLI pedir.

# Alternativas com URL efêmera (mudam a cada reconexão):
ssh -R 80:localhost:3001 nokey@localhost.run
ngrok http 3001
```

> ⚠️ **Túnel efêmero dá muito retrabalho.** Cada queda gera uma URL nova que precisa ser
> atualizada em três lugares: `.env.local`, o webhook e a URI de redirecionamento na Meta.
> Pior: se o túnel cair no meio do OAuth, o `code` da Meta se perde e a conta não conecta.

### 🚨 Acesse o app pelo domínio público, nunca por localhost

O OAuth guarda o `state` num cookie. Se você **iniciar** o login em `http://localhost:3001`
mas o `redirect_uri` apontar para o túnel, o callback chega num domínio diferente, o cookie
não existe lá e o fluxo morre com `state-invalido`.

Comece e termine sempre no mesmo domínio — o público.

### 4. Variáveis e execução

```bash
cp .env.example .env.local   # preencha
npm run dev
```

Abra `http://localhost:3000`, clique em **Conectar Instagram**, autorize.

Depois rode `supabase/seed.sql` no SQL Editor para criar o fluxo de exemplo
("comenta CHECKLIST → recebe no direct").

### 5. Deploy

```bash
vercel --cwd . deploy --prod
```

Suba as mesmas variáveis em **Project Settings → Environment Variables**.
O cron do `vercel.json` roda sozinho — a Vercel manda o `Authorization: Bearer $CRON_SECRET`.

Ajuste `INSTAGRAM_REDIRECT_URI` e a URL do webhook para o domínio de produção.

---

## Escrevendo um fluxo

Fluxo é JSON na coluna `flows.definition`. Validado por Zod em `src/lib/flow/types.ts`.

```jsonc
{
  "entry": "abertura",
  "nodes": {
    "abertura": {
      "type": "message",
      "text": "Oi {{nome}}! Quer o checklist?",
      "quickReplies": [{ "title": "Quero", "payload": "SIM" }],
      "next": "espera"
    },
    "espera":  { "type": "wait_reply", "saveAs": "resposta", "next": "checa" },
    "checa":   {
      "type": "condition",
      "cases": [{ "source": "last_input", "op": "contains", "value": "SIM", "next": "entrega" }],
      "fallback": "fim"
    },
    "entrega": { "type": "tag", "add": ["lead"], "next": "link" },
    "link":    {
      "type": "buttons",
      "text": "Toma aí 👇",
      "buttons": [{ "title": "Baixar", "url": "https://exemplo.com" }],
      "next": "fim"
    },
    "fim": { "type": "end" }
  }
}
```

### Nós disponíveis

| Tipo | O que faz |
|---|---|
| `message` | Manda texto. `quickReplies` opcional (até 13, título de 20 chars) |
| `buttons` | Card com até 3 botões (`url` para link, `payload` para postback) |
| `wait_reply` | Pausa até o contato responder. `saveAs` guarda a resposta em `vars` |
| `condition` | Ramifica. `op`: `contains`, `equals`, `starts_with`, `has_tag`, `exists` |
| `delay` | Dorme N segundos. O cron retoma |
| `tag` | Adiciona/remove tags do contato |
| `http` | Chama webhook externo (n8n, CRM, checkout). `saveAs` guarda a resposta |
| `end` | Encerra |

Interpolação no texto: `{{nome}}`, `{{username}}`, e qualquer chave de `vars`.

### Gatilhos

Linha na tabela `triggers`:

| Campo | Detalhe |
|---|---|
| `type` | `comment`, `keyword` (DM, inclui payload de ice breaker), `story_reply`, `story_mention`, `default` (fallback de DM) |
| `keywords` | Array. Vazio = casa com qualquer texto |
| `match_mode` | `contains` (padrão), `exact`, `starts_with` — ignora acento e caixa |
| `media_id` | Só para `comment`. `null` = qualquer post |
| `public_reply` | Resposta pública no comentário antes da DM. Opcional |
| `priority` | Maior ganha quando dois gatilhos casam |

---

## Limites conhecidos

- **Um fluxo por contato de cada vez.** Um segundo gatilho é ignorado enquanto o primeiro roda
  (índice único parcial em `flow_runs`). Para reentrar, o fluxo tem que terminar.
- **Sem builder visual.** Fluxo é JSON no banco. `@xyflow/react` resolve, é a fase 2.
- **Single-tenant.** Um usuário só, autenticado por `PANEL_PASSWORD`. Não há contas nem papéis.
- **Sem rate limiting próprio.** Disparo em massa pode bater no limite da Meta.
- **Token no banco em texto puro.** Aceitável com RLS + service_role, mas se virar
  multi-tenant, criptografe (`pgsodium` ou KMS).

---

## Segurança

Expor a porta na internet (Funnel, túnel, deploy) **atrai varredura automatizada em minutos** —
bots procurando `.env`, `.ssh/id_rsa`, `.git/config`, `backup.sql`. O Next não serve esses
arquivos, então não há vazamento, mas o painel em si precisa de senha.

`src/proxy.ts` tranca tudo atrás de `PANEL_PASSWORD`. Ficam abertas apenas as rotas que a Meta
e o cron precisam alcançar, cada uma com autenticação própria:

| Rota aberta | Como se protege |
|---|---|
| `/api/webhooks/instagram` | assinatura HMAC (`x-hub-signature-256`) |
| `/api/auth/instagram/*` | `state` em cookie httpOnly |
| `/api/cron/tick` | `CRON_SECRET` no header ou query |
| `/login`, `/privacidade` | públicas por natureza |

**Sem `PANEL_PASSWORD` definida o painel fica aberto** — o proxy só registra um aviso no log,
para não trancar você para fora sem explicação. Defina antes de expor.

Para desligar a exposição quando não estiver testando:

```bash
tailscale funnel --https=443 off   # fecha
tailscale funnel --bg 3001         # reabre
```

---

## Troubleshooting

| Sintoma | Causa provável |
|---|---|
| Webhook devolve `401 Invalid signature` | `INSTAGRAM_APP_SECRET` errado. Tem que ser a **chave secreta do app do Instagram**, não a do Facebook App |
| Webhook não é verificado (a Meta recusa a URL) | `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` diferente do que você digitou no painel da Meta, ou a URL não está acessível por HTTPS |
| OAuth volta com `redirect_uri` inválido | A URI tem que bater caractere por caractere com a cadastrada, inclusive a barra final |
| **Autorizou mas nada chega no webhook** | Quase sempre é a conta não inscrita nos campos. Confira com `GET /me/subscribed_apps`: se voltar `{"data":[]}`, rode `POST /me/subscribed_apps?subscribed_fields=comments,messages,messaging_postbacks`. O painel avisa quando isso acontece. Verifique também se **Ferramentas de mensagens conectadas** está ativo no app do Instagram |
| Comentário dispara, DM não chega | Private reply já foi usada naquele comentário (só vale 1x) ou o comentário tem mais de 7 dias |
| DM de fluxo para de sair no meio | Janela de 24h fechou. Veja `flow_runs.error` |
| `flow_runs` parado em `sleeping` | O cron não está rodando. Local: chame `/api/cron/tick?secret=SEU_CRON_SECRET` na mão |

---

## Comandos

```bash
npm run dev          # desenvolvimento
npm run build        # build de produção
npx tsc --noEmit     # typecheck
npm run lint         # eslint
```
