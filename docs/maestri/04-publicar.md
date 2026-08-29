# CARD 04 — O post nasce dentro do painel, com a automação já apontada para ele

> Pré-requisito: leia `00-contexto.md`.
> **A fase 0 é do dono e bloqueia a fase 2 em diante.** A fase 1 (migration) não depende dela.
> Tamanho: 5 fases, cada uma entregável e verificável sozinha — **não emende num commit só.**

## O problema real

O sistema cobre tudo o que acontece **depois** do post: comentário → resposta pública → DM →
fluxo → entrega. O post em si nasce fora. O dono grava, sobe pelo app do Instagram, e só então
abre o painel para criar a automação e apontá-la para o post (`triggers.media_id`).

Isso produz um bug sem erro e sem log, já vivido em produção: **automação com `media_id` preso a
um post antigo não dispara no post novo.** O vídeo novo sobe, o comentário chega, o matcher
(`src/lib/flow/triggers.ts:49`) descarta porque o `media_id` é outro, e o tick responde
`ok:true`. A automação está "ativa" no painel e o lead comenta no vazio.

E o roteiro que a biblioteca escreve **para em texto**: `scripts.output` tem legenda, ganchos e
CTA, e nada disso sai do banco sem copiar e colar.

**Decisão de 29/08/2026, para não rediscutir:** avaliamos importar o Bravy Publisher (três
repositórios, ~42 mil linhas — NestJS, Prisma, Redis/BullMQ, MinIO, `skia-canvas`, estúdio
Konva de 9 mil linhas). **Não portar.** 60% do chão já existe aqui: OAuth com token e refresh
(`src/lib/instagram/oauth.ts`), storage público com URL estável (`src/lib/delivery/file-url.ts`,
`src/lib/library/thumbs.ts`), cron por tick com claim otimista (`src/app/api/cron/tick/route.ts`)
e chamada direta à Anthropic (`src/lib/ai/anthropic.ts`). O resto (multi-tenant, JWT, LinkedIn,
worker, editor arrastável) não serve num painel single-tenant na Vercel. O que serve são umas
1,5 mil linhas novas — este card e o `05-criar.md`.

## O que construir

```
upload (ou o carrossel do card 05) → publications (draft) → agendar → o TICK publica → post no ar
                                                                           └→ gatilho da automação escolhida
                                                                              clonado para o post novo
```

Três ganhos, nesta ordem:

1. **Gatilho preso a post velho deixa de existir.** O post nasce com a automação apontada para
   ele, criada pelo sistema no instante em que a Meta devolve o `media_id`.
2. **Publicar em horário definido, com jitter, respeitando silêncio e cap** — pelo mesmo tick que
   já entrega DM, com o mesmo claim e a mesma regra de "adiar não é falhar".
3. **O card 05 ganha destino.** Carrossel gerado vira `publication` e sai por aqui.

## O que a API entrega (Instagram Login)

Host: **`graph.instagram.com`**, o mesmo de `src/lib/instagram/api.ts:4`. Nosso token vem do
Instagram Login (`oauth.ts`, cabeçalho). **Não use `graph.facebook.com`**: aquele host é para
token de Facebook Login (Page token), que não é o nosso. O Publisher usa facebook.com porque o
OAuth dele é o outro — copiar isso daria `code 190` sem explicação.

- `POST /{ig-user-id}/media` cria um **container**.
  Imagem: `image_url` (JPEG, público, ≤ 8 MB, proporção entre 4:5 e 1.91:1), `caption`.
  Item de carrossel: idem `+ is_carousel_item=true`, sem caption.
  Carrossel: `media_type=CAROUSEL`, `children=id1,id2,…` (2 a 10), `caption`.
  Reel: `media_type=REELS`, `video_url`, `caption`, opcional `cover_url`.
- `GET /{container-id}?fields=status_code,status` → `IN_PROGRESS | FINISHED | ERROR | EXPIRED |
  PUBLISHED`. Imagem fica pronta em segundos; vídeo pode levar minutos.
- `POST /{ig-user-id}/media_publish` com `creation_id` → `{ id }`, que é o `platform_media_id`
  do post — o mesmo id que `fetchMedia` devolve e que `triggers.media_id` guarda.
- `GET /{ig-user-id}/content_publishing_limit?fields=quota_usage,config` → uso e teto da própria
  Meta (100 publicações por API a cada 24 h).
- Escopo necessário: **`instagram_business_content_publish`**.

**Confirme com `curl` contra a conta real antes de codar a fase 2.** É a regra do card 02 e vale
aqui: o que a documentação diz e o que a conta responde já divergiram neste projeto
(`src/lib/instagram/insights.ts`, comentário de `fetchMediaInsights`). O que não bater, o card
está errado, não a conta.

**PNG.** A documentação lista JPEG para `image_url`. O render do card 05 sai em PNG (satori) e o
dono pode subir PNG à mão. Regra: **o bucket só guarda o que a Meta aceita** — a conversão para
JPEG acontece na entrada (upload, fase 4; render, card 05), via `sharp`. Ele já está em
`node_modules` como dependência opcional do Next 16 (`0.34.5`); torne-o dependência explícita em
`package.json` para não depender de um detalhe do `next`.

---

## Fase 0 — DO DONO, e bloqueia a fase 2 em diante

Sem o escopo, toda chamada de publicação responde
`(#10) Application does not have permission for this action`. Não é bug: é consentimento.

1. **(agente)** Somar `'instagram_business_content_publish'` ao array `SCOPES` em
   `src/lib/instagram/oauth.ts:8`. Uma linha. Commit. Deploy é do dono.
2. **(dono)** Em developers.facebook.com → app **`dm-flow-IG`** (ID `2815946815447454`, **não** o
   Facebook App) → Instagram → Configuração da API com login do Instagram → conferir que a
   permissão de publicação está na lista do app.
3. **(dono)** Abrir `https://dm.nocodepedro.site` e **reconectar o Instagram** — nunca por
   localhost (`README.md`, seção 🚨). O token atual foi emitido sem o escopo e continua sem ele
   para sempre; só um consentimento novo traz o quinto.
4. **(dono, instância Beca)** Mesmo passo no app dela. Os dois bancos não se falam.

**Como saber se funcionou:** `select username, scopes from accounts;` no SQL Editor. A coluna
`scopes` é preenchida pelo callback (`src/app/api/auth/instagram/callback/route.ts:55`) com o que a
Meta concedeu. Se `instagram_business_content_publish` não está no array, não está.

Nota: o quadro tem uma reconexão pendente do card 02 (escopo de insights, que **já** está em
`SCOPES`). É **a mesma reconexão** — uma visita ao painel resolve os dois cards.

## Fase 1 — Schema

Escreva `supabase/migrations/0021_publicacoes.sql`. **Não aplique** — avise o dono (regra 2 do
contexto). Cabeçalho em comentário explicando o porquê, como as migrations 0016 e 0019 fazem.

```sql
create table if not exists public.publications (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  kind               text not null check (kind in ('image', 'carousel', 'reel')),
  caption            text not null default '',
  -- CAMINHOS no bucket, nunca URLs (mesma regra de deliveries / file-url.ts).
  media_paths        text[] not null default '{}',
  cover_path         text,
  status             text not null default 'draft'
                     check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at       timestamptz,
  published_at       timestamptz,
  -- Retomada: container já criado na Meta sobrevive a timeout do tick.
  container_ids      jsonb not null default '{}'::jsonb,
  platform_media_id  text,
  permalink          text,
  attempts           int not null default 0,
  error              text,
  -- Automação cujo gatilho de comentário é clonado para o post novo (fase 5).
  flow_id            uuid references public.flows(id) on delete set null,
  script_id          uuid references public.scripts(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists publications_queue_idx
  on public.publications (account_id, status, scheduled_at);

alter table public.publications enable row level security;
```

Decisões que **não** são estilo, e o porquê:

- **`container_ids jsonb`, e o orquestrador grava ali a cada passo.** A Meta cria o container do
  lado dela. Se o tick morrer entre criar e publicar (`maxDuration` é 300 s; vídeo processa por
  minutos), uma retentativa que recrie containers produz **post duplicado** quando o anterior
  também chega a publicar. Gravar `{ children: [...], parent: '...' }` e retomar de onde parou
  é o mesmo princípio de `startFlow` retomando run `failed` em vez de recomeçar do `entry`.
- **`media_paths`, não URL.** Quem monta a URL é uma função (`publicationMediaUrl`), igual a
  `deliveryFileUrl`. URL no banco é phishing servido do nosso domínio esperando acontecer.
- **`status = 'publishing'` é o claim.** Até cinco ticks convivem; sem claim, dois publicam o
  mesmo post e a Meta aceita os dois.
- **`attempts` + `error`** como em `pending_public_replies`: retentativa com teto, e o erro
  visível na lista, não num array que ninguém lê.
- **Publicação NÃO entra em `send_log`.** A coluna `kind` tem `check (kind in ('dm',
  'private_reply', 'public_reply'))` (migration 0002) e recusaria; e o cap por hora é regime de
  mensagem. Publicação tem cap próprio: **`PUBLISH_DAILY_CAP`** em `src/lib/env.ts`, `.default(3)`,
  contado em `publications.published_at` nas últimas 24 h. Adicione a variável **também** à
  lista do `load()` — o comentário ao lado de `PUBLIC_REPLY_PER_POST_CAP` conta o que acontece
  quando se esquece.
- **Bucket `publication-media`, PÚBLICO.** Nenhuma migration cria bucket aqui (`grep
  storage.buckets supabase/` não acha nada): `delivery-files` e `library-thumbs` foram criados à
  mão no dashboard, e este também será. **É item do dono; ponha no quadro.** Público pelo mesmo
  motivo dos outros dois — a Meta busca a mídia por URL sem credencial, e é material feito para
  ser publicado.

Também: `Publication`, `PublicationKind`, `PublicationStatus` em `src/types/db.ts`.

## Fase 2 — `src/lib/instagram/publish.ts`

O cliente de publicação, puro na medida do possível (recebe token e ids, devolve ids). Funções:

- `createImageContainer`, `createCarouselContainer`, `createReelContainer` — um `POST` cada.
- `getContainerStatus(containerId, token)` → `status_code`.
- `waitUntilFinished(containerId, token, { budgetMs })` — poll a cada 4 s até `FINISHED`.
  `ERROR`/`EXPIRED` → erro **permanente**. Orçamento estourado → `ContainerNotReadyError`,
  **transitório**: o container continua lá, e a próxima rodada retoma pelo id gravado. Orçamento
  de **120 s**; o motivo está na fase 3.
- `publishContainer({ igUserId, token, creationId })` → `{ id }`.
- `fetchPublishingQuota(igUserId, token)` → `{ used, total }`.
- `publishPublication({ publication, account, persist })` — o orquestrador. `persist(containerIds)`
  é chamado **depois de cada container criado**, antes de seguir. Na entrada, o que já está em
  `publication.container_ids` é reaproveitado, nunca recriado.

**Erros.** Reaproveite `MetaSendError` e `isPermanentError` de `src/lib/instagram/errors.ts`: o
corpo de erro da Graph tem a mesma forma (`error.code`, `error_subcode`), e `190` (token morto)
já é permanente lá. **Não invente lista de códigos de publicação.** A regra de ouro daquele
arquivo vale: desconhecido é transitório. Quando um erro permanente de publicação aparecer numa
resposta real, aí sim entra na lista — com data e mensagem no comentário, como as outras.

**URL da mídia:** `src/lib/publications/media-url.ts` com `publicationMediaUrl(path, supabaseUrl)`
espelhando `deliveryFileUrl`, sem o `?download`.

**Testes** (`publish.test.ts`, `fetch` simulado como em `anthropic.test.ts`): sequência do
carrossel (N filhos → espera → pai → espera → publish); retomada com `container_ids` parcial pula
o que já existe; `ERROR` vira permanente; orçamento estourado vira transitório e **não** chama
`media_publish`.

## Fase 3 — A drenagem no tick

`src/lib/publications/drain.ts`, chamado de `src/app/api/cron/tick/route.ts`. O `route.ts` já
tem 300 linhas; ele **chama**, não implementa. Exporte `drainScheduledPublications()`:

1. `status = 'scheduled' and scheduled_at <= now()`, mais antigo primeiro. **Uma publicação por
   conta por tick.** Ritmo, não vazão — o cap limita o volume, e o padrão é o que o filtro lê.
2. Antes de qualquer tentativa, com **`continue`**, nunca dentro do `try`:
   `account.automations_paused` → pula. `isQuiet(account)` → pula (o post sai na próxima
   abertura). Cap diário (`PUBLISH_DAILY_CAP`) estourado → pula. `fetchPublishingQuota` com
   `used >= total` → pula. **Adiar não é falhar** — o comentário em `drainPublicReplies` conta o
   incidente em que cinco ticks em rajada levaram a fila inteira ao teto de `attempts`.
   Erro ao **contar** o cap conta como cap estourado (`send-cap.ts`: falha fechado).
3. **Claim:** `update ... set status = 'publishing', updated_at = now() where id = ? and status =
   'scheduled'` com `.select('id').maybeSingle()`. `null` → outro tick pegou; `continue`.
4. `publishPublication(...)` com `persist` gravando `container_ids`.
5. Sucesso: `status = 'published'`, `published_at`, `platform_media_id`, `permalink`
   (`GET /{id}?fields=permalink`), `error = null`.
6. Falha transitória: `status = 'scheduled'`, `attempts + 1`, `error`, `scheduled_at = now() +
   backoff(attempts)` (2, 5, 15, 30, 60 min), **`container_ids` intactos**. Permanente, ou
   `attempts >= 5`: `status = 'failed'`.
7. **Travado:** `status = 'publishing' and updated_at < now() - 10 min` volta para `scheduled`,
   como `requeueStuckEvents` faz. **Dez minutos, não cinco**, e o orçamento de espera da fase 2 é
   120 s: um tick vivo esperando vídeo processar nunca pode ser "destravado" por outro tick
   enquanto ainda está publicando — seria o duplo envio de 31/07 com post em vez de DM.
8. **Nunca 503.** Embrulhe em `try/catch` no `route.ts` como `collectMediaInsights`; erro é
   `console.error`. O 503 é exclusivo do polling, porque é o único aviso de que a ENTREGA parou.
   Acrescente `publications` ao `body` da resposta.
9. Ordem no tick: depois de `drainPublicReplies`, antes de `collectMediaInsights` — o post
   recém-publicado já entra na coleta de insights e no `sync-own` da rodada seguinte.
10. **Jitter é aplicado ao agendar** (fase 4): `scheduled_at = escolhido + aleatório(0..7 min)`.
    A drenagem não dorme — `sleep` dentro de uma função de 300 s é orçamento jogado fora.

**Testes** (`drain.test.ts`, Supabase simulado como em `engine.test.ts`): claim perdido → não
publica; cap estourado → `attempts` não muda; transitório → volta a `scheduled` com backoff e
`container_ids` preservados; permanente → `failed`; sucesso → campos preenchidos.

## Fase 4 — As telas

`src/app/(app)/publicacoes/`:

- **`page.tsx`** — lista: capa, tipo, status, agendado para, publicado em, erro, ações
  (publicar agora · reagendar · cancelar · excluir). Cancelar só em `draft`/`scheduled`;
  **`publishing` não se cancela** — a Meta pode já ter o container. Excluir só `draft`/`failed`,
  e remove os arquivos do bucket.
- **`nova/page.tsx`** — 1 imagem, 2–10 imagens ou 1 vídeo → legenda → automação de comentário
  (fase 5) → "agendar para" ou "publicar agora". **"Agora" também passa pelo tick** (`scheduled`
  com `scheduled_at = now()`). Nunca chame a Meta de dentro de uma server action: o tick tem o
  claim, o cap, a retentativa e o silêncio. Uma action que publica direto é um segundo caminho
  para manter, e é exatamente o que contorna as travas.
- **`actions.ts`** — `uploadPublicationMedia`, `createPublication`, `schedulePublication`,
  `publishNow`, `cancelPublication`, `deletePublication`. Espelhe `uploadDeliveryFile`
  (`biblioteca/entregas/actions.ts:144`): nome saneado antes do upload, whitelist de tipo,
  teto de tamanho. Tipos: `image/jpeg`; `image/png` → **convertido para JPEG** com `sharp` antes
  de subir; `video/mp4`. Proporção fora de 4:5–1.91:1 → recuse na action com mensagem clara,
  não deixe a Meta recusar horas depois no tick.
- **Vídeo não passa pela server action.** O limite de corpo de action é pequeno por padrão
  (leia `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`
  antes de decidir o valor). Para vídeo, a action devolve uma **URL de upload assinada**
  (`storage.createSignedUploadUrl`) e o navegador sobe direto para o bucket — a `service_role`
  nunca vai ao navegador.
- **Navegação:** `{ href: '/publicacoes', label: 'Publicações' }` em
  `src/components/layout/top-nav.tsx:30`, depois de Biblioteca.
- **Conta:** use `getAccount()` (`src/lib/data.ts:28`) como as outras telas. Limitação conhecida:
  ela lê a conta ativa mais antiga. Multi-conta é outro trabalho — **não resolva aqui**.
- **Visual:** a direção atual, por tokens semânticos (`bg-surface`, `text-muted`…), nunca cor
  crua — o card 03 vai trocar a pele pelos tokens, e tela com cor crua fica de fora. Cuidado com
  `.surface-panel`/`.chrome-panel` fora de `@layer` (topo do `globals.css`).

## Fase 5 — O post nasce com a automação

É o ganho número 1 deste card, e é pequeno:

- Em `nova/`, um seletor **"Automação de comentário"** com os fluxos que têm gatilho
  `type = 'comment'` (`getAutomations()` já traz `triggers` + `flows`). Grava `flow_id`.
- Na drenagem, depois de `published` com `platform_media_id`: para cada trigger do `flow_id` com
  `type = 'comment'` **e `media_id` não nulo**, **clonar** (`keywords`, `match_mode`,
  `public_reply`, `priority`, `is_active`) com `media_id = platform_media_id`. Se o fluxo tem
  gatilho com `media_id` nulo (vale para todo post), não clona — já cobre.
- **Clonar, não redirecionar.** O gatilho do post antigo continua respondendo quem comenta lá.
- **Idempotente:** antes de inserir, procure trigger com o mesmo `flow_id` + `media_id`. O tick
  retenta, e retentativa não pode duplicar gatilho.
- **Falha aqui não é acessório.** Gatilho que não nasceu é exatamente o bug silencioso que este
  card mata. Se a clonagem falhar, mantenha `status = 'published'` e grave em `error`:
  `"publicado, mas o gatilho não foi criado: <motivo>"`. A lista mostra o aviso; ninguém descobre
  por comentário sem resposta.
- O post entra na biblioteca sozinho pelo `sync-own` do tick seguinte (`fetchMedia`). Confirme;
  não duplique.

---

## Definição de pronto

- [ ] `npx tsc --noEmit && npm run lint && npm test && npm run build` — quatro verdes
- [ ] Testes novos: `publish.test.ts`, `drain.test.ts`, `media-url`, saneamento do upload
      (nome, tipo, proporção)
- [ ] Migration **escrita** e o dono **avisado**; bucket `publication-media` no quadro como item
      do dono — nenhum dos dois feito por você
- [ ] **Provado contra a API real:** uma imagem publicada de verdade a partir de `/publicacoes`,
      no post que o dono escolher. "Passa no vitest" não é "a Meta aceitou" (`00-contexto.md`,
      última seção)
- [ ] O gatilho clonado apareceu em `triggers` com o `media_id` do post novo, e um comentário de
      teste disparou o fluxo

## O que NÃO fazer

- Não chame a Meta de dentro de server action. Só o tick publica.
- Não recrie container que já está em `container_ids`.
- Não conte publicação em `send_log`.
- Não use `graph.facebook.com`.
- Não guarde URL no banco; caminho.
- Não ponha cap, silêncio ou pausa dentro do `try` que incrementa `attempts`.
- Não responda 503 por falha de publicação.
- Não aplique migration, não crie bucket, não faça deploy, não rode `npm run dev`.
- Não mexa em `src/lib/webhook/poll.ts` nem `process.ts` — nada aqui precisa deles.
- Não "conserte" o `getAccount()` multi-conta de passagem.
