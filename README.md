# dm-flow

Automação de DM e comentário do Instagram. O núcleo do ManyChat, self-hosted, single-tenant.

Faz: comentário com palavra-chave → resposta pública + DM automática · palavra-chave na DM →
fluxo · resposta de story → fluxo · ice breakers publicados na conta · etiquetas, campos,
delays, condições, pergunta validada, mídia por URL e chamada de webhook externo.

Este arquivo é o "como rodar". O porquê das decisões está no `HANDOFF.md`; as regras que não
podem ser quebradas, no `CLAUDE.md`; o que falta, no `ROADMAP.md`.

---

## Como funciona

A entrega **não é por webhook**. O webhook está implementado e assinado, e nunca entregou um
evento neste projeto — o diagnóstico está no `HANDOFF.md`. Quem alimenta a automação é a
varredura ativa:

```
pg_cron (Supabase, 1 min)
   │
   ▼
/api/cron/tick               autentica por CRON_SECRET
   │
   ▼
pollAll()                    GET /me/media, /{media}/comments (com replies), /me/conversations
   │                         cursor por conta + 5 min de sobreposição
   ▼
webhook_events               fila com dedup_key; comentário nasce com 8–35 s de jitter
   │
   ▼
processPending()             claim otimista → acha conta, contato e gatilho
   │
   ▼
engine.ts                    caminha pelos nós até pausar, dormir ou terminar
   │
   ▼
Graph API                    private reply (se veio de comentário) ou DM comum
```

O mesmo tick ainda: recolhe evento travado, retoma fluxo que estava em `delay`, drena a fila de
resposta pública e renova o token faltando 10 dias dos 60. Se a varredura falhar em alguma
conta, a rota responde **503** de propósito — o histórico do pg_cron é o único lugar onde
alguém percebe que a automação parou.

O caminho do webhook continua no código (`/api/webhooks/instagram`) e alimenta a mesma fila. O
`dedup_key` torna os dois idempotentes entre si: se a Meta um dia entregar, nada duplica.

---

## Regras da Meta que moldam tudo

| Regra | Consequência no código |
|---|---|
| **Janela de 24 h** — só dá para mandar DM até 24 h depois da última mensagem do contato | `canSendDm()` no `engine.ts` lê `contacts.last_inbound_at` |
| **Private reply** — DM a partir de comentário, 1× por comentário, até 7 dias | `ctx.pendingCommentId`: a primeira mensagem do fluxo sai como private reply |
| **Comentário não abre a janela de DM** | `markInbound: false` no `upsertContact` do comentário. Quem abre a janela é o toque num botão de postback |
| **Anexo não cabe em private reply** | bloco de mídia nascido de comentário para em `waiting_reply` e envia o anexo depois que a pessoa responde |
| **Texto de DM é 1000 BYTES**, não caracteres | `dmTextSchema` mede em UTF-8 (acento custa 2, emoji 4) e o envio corta por code point |
| **Estourar limite recusa a mensagem INTEIRA** (erro 100) | limites em `META_LIMITS`; schema valida a maior expansão do spintax, o envio trunca |
| **A Meta reentrega eventos** | `dedup_key` único (`msg:<mid>` / `comment:<id>`) |
| **Echo** — a Meta devolve as mensagens que você mesmo mandou | `if (value.message?.is_echo) return` |
| **Token longo vence em 60 dias** | o tick renova faltando 10 |
| **Webhook exige DUAS assinaturas independentes** | app (`POST /{app-id}/subscriptions`) **e** conta (`POST /me/subscribed_apps`). Faltando qualquer uma, nada chega — e sem erro |
| **Filtro de spam pune repetição** | spintax obrigatório, jitter, caps. Ver `CLAUDE.md` — é invariante, não estilo |

---

## Setup

### 1. Supabase

Crie o projeto e rode as migrations **na ordem dos arquivos**:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_anti_spam.sql
supabase/migrations/0003_inbox.sql
supabase/migrations/0004_flow_metrics.sql
supabase/migrations/0005_lead_source.sql
supabase/migrations/0006_operacao.sql
supabase/migrations/0007_inbox_atendimento.sql
supabase/migrations/0008_resposta_publica_idempotente.sql
supabase/migrations/0009_captura_total.sql
supabase/migrations/0010_story_mention_trigger.sql
supabase/migrations/0011_ice_breakers.sql
supabase/migrations/0012_contact_profile.sql
supabase/migrations/0013_button_clicks.sql
```

> **Não há CLI do Supabase nem `psql` nesta máquina.** Migration é copiada e colada no SQL
> Editor do painel, um arquivo por vez, na ordem acima. Não existe controle de versão do que já
> foi aplicado além do próprio banco — antes de subir código que depende de uma tabela nova,
> confirme no SQL Editor que ela existe. O código de métrica é escrito para sobreviver a uma
> tabela ausente (erro vira log, a entrega continua), mas o resto não é.

Pegue `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` em **Project Settings → API**.

> RLS está ligada em todas as tabelas e **sem policy nenhuma**. Só a `service_role` escreve. É o
> certo enquanto não existe login de usuário; quando existir, adicione `owner_id` + policies.

Depois de tudo — e depois de conectar a conta pelo painel, porque ele depende de uma linha em
`accounts` — `supabase/seed.sql` cria o fluxo de exemplo ("comenta CHECKLIST → recebe no
direct").

> ⚠️ **O seed insere a automação já ativa e com textos sem spintax.** A trava de variação mora
> em `saveAutomation` (a action do painel), não no banco, então o SQL passa por cima dela. Uma
> automação com texto fixo respondendo em volume é exatamente o padrão que restringiu a conta em
> 30/07/2026. Se for usar o seed com tráfego real, abra a automação no painel e salve com as
> variações preenchidas — ou deixe pausada.

### 2. App na Meta

1. [developers.facebook.com](https://developers.facebook.com/apps) → **Create App** → tipo
   **Business**.
2. Adicione o produto **Instagram** → **API setup with Instagram login**.
3. Em **Business login settings**:
   - **Redirect URI**: `https://SEU-DOMINIO/api/auth/instagram/callback`
   - Permissões: `instagram_business_basic`, `instagram_business_manage_messages`,
     `instagram_business_manage_comments` (é exatamente a lista de `SCOPES` em `oauth.ts`).
4. Copie o **ID do app do Instagram** e a **Chave secreta do app do Instagram**. Eles ficam na
   própria tela do produto Instagram — **não** em App settings → Basic. Aqueles são do Facebook
   App e não servem para o login com Instagram. Esse engano já custou tempo duas vezes.
5. A conta do Instagram precisa ser **profissional** (Business ou Creator) e ter **Ferramentas
   de mensagens conectadas** ativado (Instagram → Configurações → Mensagens).

> **Modo de desenvolvimento**: funciona nas suas próprias contas sem App Review, mas a conta
> precisa ter a função **Testador do Instagram** e aceitar o convite em Instagram →
> Configurações → Apps e sites → Convites do testador. Sem isso o OAuth falha com "Função de
> desenvolvedor é insuficiente". Para conectar conta de terceiro é obrigatório App Review +
> Business Verification.

### 3. Webhook — opcional, e nunca funcionou aqui

O sistema entrega por polling; o webhook é bônus. Mantenha esta seção porque é o diagnóstico
completo caso alguém queira tentar de novo — e porque é a armadilha que mais engana.

**a) Assinatura no nível do APP.** Cadastrar a URL na interface **não** assina os campos, e a UI
nova da Meta nem mostra essa lista.

```bash
APP_ID=...        # ID do FACEBOOK App (não o do Instagram)
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

**b) Assinatura no nível da CONTA.** Automática no callback do OAuth (`subscribeToWebhooks`
assina `comments`, `messages`, `messaging_postbacks`, `messaging_seen`, `live_comments`).
Confira com `GET /me/subscribed_apps`.

**c) App publicado.** Exige URL de política de privacidade preenchida — este projeto serve uma
em `/privacidade`. Não exige App Review.

Com as três ativas, a entrega ainda assim nunca aconteceu neste projeto.

### 4. Variáveis de ambiente

**Não existe `.env.example` no repositório** — `.gitignore` bloqueia `.env*` e nenhum exemplo
foi versionado. A lista real é o schema Zod em `src/lib/env.ts`:

| Variável | Obrigatória | Para quê |
|---|---|---|
| `INSTAGRAM_APP_ID` | sim | app do **Instagram**, não o do Facebook |
| `INSTAGRAM_APP_SECRET` | sim | troca de code no OAuth e validação de assinatura do webhook |
| `META_APP_SECRET` | não | Chave Secreta do app do **Facebook** (`1300921041880198`). Só para o HMAC do webhook: a inscrição `object=instagram` vive nesse app, então é com esse segredo que a Meta assina. Sem ela, só a chave do Instagram vale e a entrega segue pela varredura |
| `INSTAGRAM_REDIRECT_URI` | sim | tem que bater caractere por caractere com a cadastrada |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | sim | handshake `GET` do webhook |
| `SUPABASE_URL` | sim | |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | o app escreve como `service_role`; RLS não tem policy |
| `CRON_SECRET` | sim | protege `/api/cron/tick` |
| `PANEL_PASSWORD` | não (mín. 8) | **sem ela o painel fica aberto** — o proxy só loga um aviso |
| `SEND_HOURLY_CAP` | não (padrão 60) | teto de envios/hora por conta |
| `PUBLIC_REPLY_PER_POST_CAP` | não (padrão 8) | teto de resposta pública no mesmo post por hora |
| `CONVERSION_SECRET` | não (mín. 16) | sem ela, `POST /api/conversao` recusa tudo |

`env` é um Proxy lazy: só valida no primeiro acesso, para `next build` não exigir `.env`. Se
alguém transformar isso numa constante avaliada no import, o build do CI quebra.

### 5. Rodar

```bash
npm install
npm run dev      # next dev, porta 3000
```

`package.json` não fixa porta; o Next sobe na 3000 e cai na próxima livre se ela estiver
ocupada — na máquina do dono costuma virar 3001.

> ⚠️ **`npm run dev` usa o `.env.local`, que aponta para o banco de PRODUÇÃO.** Não existe
> ambiente de staging. Rodar o dev local mexe nos mesmos dados, e um tick manual dispara DM de
> verdade. Se for só mexer em código, `npx tsc --noEmit && npm run lint && npm test` cobre quase
> tudo sem subir o servidor.

Abra o painel, faça login com `PANEL_PASSWORD`, clique em **Conectar Instagram** e autorize.

Para testar OAuth ou webhook fora da Vercel é preciso HTTPS público. Túnel com URL fixa
(Tailscale Funnel) poupa muito retrabalho: com URL efêmera, cada queda obriga a atualizar o
`.env.local`, o webhook e a URI de redirecionamento na Meta — e se o túnel cair no meio do
OAuth, o `code` se perde. Feche o túnel quando não estiver usando: porta exposta atrai varredura
automatizada em minutos.

### 🚨 Acesse sempre pelo domínio público, nunca por localhost

O OAuth guarda o `state` num cookie. Se você **iniciar** o login em `http://localhost:3000` com
o `redirect_uri` apontando para o domínio público, o callback chega num domínio diferente, o
cookie não existe lá e o fluxo morre com `state-invalido`. Comece e termine no mesmo domínio.

### 6. Deploy

```bash
vercel --cwd . deploy --prod
```

Suba as mesmas variáveis em **Project Settings → Environment Variables** e ajuste
`INSTAGRAM_REDIRECT_URI` para o domínio de produção.

O `vercel.json` agenda o tick **uma vez por dia às 03h** — é o teto do plano Hobby, e serve só
de rede de segurança. Quem dispara de minuto em minuto é o **pg_cron do Supabase**, configurado
à mão fora deste repositório (ver `HANDOFF.md`). Se o pg_cron parar, a automação para com ele.

---

## Escrevendo um fluxo

Fluxo é JSON na coluna `flows.definition`, validado por Zod em `src/lib/flow/types.ts`. Há um
**builder visual em canvas** (`@xyflow/react`) em `/automacoes/[id]` — o JSON abaixo é o formato
de armazenamento, não a única forma de editar. O campo `layout` guarda a posição de cada bloco
no canvas e o engine ignora.

```jsonc
{
  "entry": "abertura",
  "nodes": {
    "abertura": {
      "type": "message",
      "text": "{Oi|E aí} {{nome}}! Quer o checklist?",
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
      "text": "{Toma aí|Segue o link}",
      "buttons": [{ "title": "Baixar", "url": "https://exemplo.com?c={{contact_id}}" }],
      "next": "fim"
    },
    "fim": { "type": "end" }
  }
}
```

### Blocos disponíveis

| Tipo | O que faz |
|---|---|
| `message` | Texto. `quickReplies` opcional (até 13, título de 20 caracteres) |
| `buttons` | Card com até 3 botões (`url` para link, `payload` para postback) |
| `bubbles` | 2 a 5 mensagens curtas em sequência, com pausa entre elas. Cada bolha tem cap e variação próprios |
| `carousel` | Até 10 cards (título, subtítulo, imagem, até 3 botões). **Nunca enviado de verdade — ver `HANDOFF.md`** |
| `image` `video` `audio` `file` | Anexo por URL pública. Formato é validado pela extensão (`file` só aceita `pdf`; `audio` **não** aceita `mp3`). Vídeo, áudio e arquivo nunca foram enviados de verdade |
| `ask` | Pergunta e valida (`text`, `email`, `phone`, `number`). Repergunta até `maxRetries` e então segue com o que veio |
| `wait_reply` | Pausa até o contato responder. `saveAs` guarda a resposta em `vars` |
| `condition` | Ramifica. `op`: `contains`, `equals`, `starts_with`, `has_tag`, `exists` |
| `delay` | Dorme N segundos (máx. 20 h). O tick retoma |
| `tag` | Adiciona/remove etiquetas do contato |
| `set_field` | Escreve em `contacts.fields`. Aceita variáveis no valor |
| `randomize` | Divide o tráfego entre 2 e 4 caminhos (teste A/B) |
| `http` | Chama webhook externo. **Checa o status**: 4xx/5xx derrubam o nó em vez de gravar o corpo do erro em `saveAs` |
| `goto_flow` | Pula para outro fluxo da mesma conta, mantendo `vars`. `MAX_STEPS` segue travando ciclo |
| `unsubscribe` | Marca `subscribed = false`; nenhum fluxo dispara mais para o contato |
| `end` | Encerra |

Interpolação no texto, nos títulos e nas URLs de botão: `{{nome}}`, `{{username}}`,
`{{contact_id}}` e qualquer chave de `vars`. **A interpolação roda antes do spintax**, então
`{Oi {{nome}}|E aí {{nome}}}` funciona.

### Gatilhos

Linha na tabela `triggers`:

| Campo | Detalhe |
|---|---|
| `type` | `comment`, `keyword` (DM, inclui payload de ice breaker), `story_reply`, `story_mention`, `default` (fallback de DM) |
| `keywords` | Array. Vazio = casa com qualquer texto |
| `match_mode` | `contains` (padrão), `exact`, `starts_with` — ignora acento e caixa |
| `media_id` | Só para `comment`. `null` = qualquer post |
| `public_reply` | Resposta pública no comentário antes da DM. Opcional, e exige 3 variações para ativar |
| `priority` | Maior ganha quando dois gatilhos casam. `comment` não cai no `default` |

---

## Limites conhecidos

- **Um fluxo por contato de cada vez.** Um segundo gatilho é ignorado enquanto o primeiro roda
  (índice único parcial em `flow_runs`). Exceção: run `failed` com `current_node` é **retomado**
  de onde parou, nunca recomeçado — recomeçar reentregava mensagem já enviada.
- **Single-tenant.** Um usuário, uma senha (`PANEL_PASSWORD`), sem papéis. O schema já isola por
  `account_id`, mas não há seletor de conta.
- **Token do Instagram no banco em texto puro.** Aceitável com RLS + `service_role`; se virar
  multi-tenant, criptografe.
- **O cap protege volume e ritmo, não intenção.** Ele não sabe se dois textos são iguais — quem
  cobra isso é a trava de variação, e quem avisa é o painel de risco.
- **Métrica é best-effort.** Escrita em `flow_node_events` e `button_clicks` é disparada sem
  `await` bloqueante e o erro vai para o log. Se a migration não foi aplicada, a tela fica vazia
  em vez de quebrar — o que também significa que tela vazia não prova ausência de dado.

---

## Segurança

Expor a porta na internet atrai varredura automatizada em minutos — bots procurando `.env`,
`.ssh/id_rsa`, `.git/config`, `backup.sql`. O Next não serve esses arquivos, mas o painel em si
precisa de senha.

`src/proxy.ts` (o Middleware do Next 16 chama-se Proxy) tranca tudo atrás de `PANEL_PASSWORD`,
com sessão em cookie assinado por HMAC. Ficam abertas só as rotas que a Meta, o cron e a página
de captura precisam alcançar, **cada uma com autenticação própria**:

| Rota aberta | Como se protege |
|---|---|
| `/api/webhooks/instagram` | assinatura HMAC (`x-hub-signature-256`), validada sobre o corpo cru |
| `/api/auth/instagram/*` | `state` em cookie httpOnly |
| `/api/cron/*` | `CRON_SECRET` no header ou na query |
| `/api/conversao` | `CONVERSION_SECRET` no header ou na query |
| `/login`, `/privacidade` | públicas por natureza |

**Não adicione rota a `PUBLIC_PATHS` sem uma dessas defesas.**

**Sem `PANEL_PASSWORD` definida o painel fica aberto** — o proxy só registra um aviso no log,
para não trancar você para fora sem explicação. Defina antes de expor.

---

## Troubleshooting

| Sintoma | Causa provável |
|---|---|
| Painel diz "sessão do Instagram expirou" | Token invalidado. Quase sempre é troca de senha do Facebook — reconecte pelo painel |
| Tick respondendo 503 | A varredura falhou em alguma conta. O corpo da resposta traz `polled.errors` com a conta e o motivo |
| pg_cron marcando `succeeded` e nada acontecendo | Confira o corpo do tick, não só o status. E confirme que o job existe: `select * from cron.job` |
| Automação não ativa, erro falando de variações | Trava anti-spam: 3 versões na resposta pública, 2 em cada texto de fluxo. A mensagem lista bloco por bloco onde falta |
| Comentário dispara, DM não chega | Private reply já usada naquele comentário (vale 1×) ou comentário com mais de 7 dias |
| DM de fluxo para no meio | Janela de 24 h fechada. Veja `flow_runs.error`. Se o fluxo nasceu de comentário, ele depende de a pessoa tocar num botão para abrir a janela |
| Bloco de mídia não envia em fluxo de comentário | É o comportamento correto: ele espera a janela abrir. Confira se a mensagem anterior tem botão |
| `flow_runs` parado em `sleeping` | O tick não está rodando. Chame `/api/cron/tick?secret=…` na mão |
| Comentário some sem resposta | Veja "Precisa de ação" no painel: evento que esgotou as 12 tentativas aparece lá, com opção de responder ou dispensar |
| Webhook devolve `401 Invalid signature` | O log diz o motivo desde 24/08 (`webhook recusado (nao_confere\|formato_invalido\|sem_cabecalho)`). `nao_confere` = nenhum dos segredos bate: confira `INSTAGRAM_APP_SECRET` (app do **Instagram**) e configure `META_APP_SECRET` (app do **Facebook**), porque quem assina é o app dono da inscrição |
| Webhook nunca entrega, sem erro nenhum | Rode `scripts/auditoria.mts`: a seção "quem entregou os eventos" separa o que veio pela Meta do que veio pela varredura, olhando campos que o polling não tem como inventar (`recipient`/`timestamp` na DM, `media_product_type` no comentário) |
| OAuth volta com `state-invalido` | Login iniciado em domínio diferente do `redirect_uri` |
| OAuth volta com `redirect_uri` inválido | A URI tem que bater caractere por caractere, inclusive a barra final |

---

## Comandos

```bash
npm run dev          # desenvolvimento (atenção: banco de PRODUÇÃO)
npm run build        # build de produção
npm start            # servidor de produção
npm run lint         # eslint
npm test             # vitest, uma passada
npm run test:watch   # vitest em watch
npx tsc --noEmit     # typecheck
```

Antes de dizer que terminou, e é o que o CI roda em toda branch e PR
(`.github/workflows/ci.yml`, Node 24):

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```
