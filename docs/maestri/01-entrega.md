# CARD 01 — A entrega nasce junto do roteiro

> Pré-requisito: leia `00-contexto.md`.
> Tamanho: 5 fases. Cada fase é entregável e verificável sozinha — **não emende as cinco num
> commit só.**

## O problema real

Hoje o sistema tem duas metades que não se conhecem:

- A **biblioteca** escreve um roteiro que promete algo: *"comenta AULA que eu te mando o mapa"*.
- A **automação** manda uma DM com um link para esse mapa.

E o link mora fora do sistema. Ninguém o gera, ninguém o versiona, ninguém sabe se ele existe.

**Prova de que isso já dói:** a automação `mapa` está ATIVA em produção e manda
`https://nocodepedro.site/mapa`, que devolve **404**. Quem comenta recebe a DM e cai no vazio.
Está perdendo lead agora, e não houve nenhum erro em lugar nenhum — porque, do ponto de vista do
sistema, mandar um link quebrado é sucesso.

Existe até uma rota inteira construída em volta dessa lacuna: `/api/conversao` existe para uma
página hospedada **em outro lugar** avisar de volta que o lead converteu, com `CONVERSION_SECRET`
colado lá e o `contact` anexado no link. Toda essa engenharia é contorno para o fato de a página
não ser nossa.

## O que construir

O gerador de roteiro passa a produzir **também a entrega**: o material que o vídeo prometeu,
publicado numa página nossa, com URL estável. Essa URL vira a variável que a automação dispara.

```
biblioteca → roteiro → ENTREGA (página nossa) → automação manda o link → funil fecha
```

Três ganhos, nesta ordem de importância:

1. **Link quebrado deixa de ser possível.** Se a entrega está no nosso banco, a URL existe.
2. **O funil fecha.** Saber quem *abriu* o presente é o dado que hoje não temos, e é o que a
   feature 02 precisa para medir conversão de verdade.
3. **Uma coisa a menos para o dono manter.** Sem hospedar página, sem colar secret, sem montar
   link à mão.

---

## Fase 1 — Schema

Escreva `supabase/migrations/0016_entregas.sql`. **Não aplique** — avise o dono (regra 2 do
contexto).

```sql
create table if not exists public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  script_id       uuid references public.scripts(id) on delete set null,
  library_item_id uuid references public.library_items(id) on delete set null,
  slug            text not null unique,
  title           text not null,
  subtitle        text,
  blocks          jsonb not null default '[]'::jsonb,
  cta_label       text,
  cta_url         text,
  status          text not null default 'draft' check (status in ('draft','published')),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.delivery_views (
  id          bigserial primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.flows
  add column if not exists delivery_id uuid references public.deliveries(id) on delete set null;
```

Decisões que **não** são preferência de estilo, e o porquê de cada uma:

- **`blocks jsonb`, nunca HTML.** O conteúdo vem de um modelo de linguagem. HTML livre de modelo
  é XSS servido na sua própria página e design quebrado de graça. Blocos tipados (`heading`,
  `paragraph`, `list`, `checklist`, `steps`, `quote`, `callout`) renderizados por componentes
  nossos: o modelo escolhe a estrutura, nós escolhemos o HTML.
- **`slug` único, com sufixo aleatório.** A página é pública e o conteúdo é o produto. Slug
  sequencial ou previsível deixa qualquer um enumerar tudo o que você já entregou. Gere
  `kebab-do-título` + `-` + 6 caracteres aleatórios: `mapa-do-conteudo-7fk2qa`. Legível na DM e
  não enumerável.
- **`status` com `draft`.** Roteiro gerado nem sempre presta. A entrega só fica no ar quando o
  dono publicar — e a página pública **só serve `published`**.
- **`delivery_views` é tabela separada**, não um contador na `deliveries`. Mesmo motivo pelo qual
  `button_clicks` não vive dentro de `flow_node_events` (veja `CLAUDE.md`): contador agregado
  responde "quantos", e a pergunta que interessa é "quem, e quando".
- **`on delete set null` no `script_id`.** Apagar o roteiro não pode derrubar uma entrega que já
  está circulando em DM.

Também: `src/types/db.ts` e RLS habilitada com zero policies, como todas as outras tabelas
(o app fala por `service_role`).

## Fase 2 — Gerar a entrega junto do roteiro

Onde: `src/lib/ai/` (schemas) e a rota `/api/scripts/generate-from-item`.

- Schema Zod `DeliverySchema` com a união discriminada de blocos. Use `z.toJSONSchema()` para
  passar ao modelo, como o gerador de roteiro já faz — **não** instale AI SDK, o projeto chama a
  Anthropic com `fetch` direto e isso é deliberado.
- Uma **segunda chamada** ao modelo, não um schema inchado na primeira. Roteiro e entrega são
  peças diferentes: o roteiro é falado, curto, com gancho; a entrega é lida, densa, sem gancho.
  Um prompt só produz uma coisa morna que não serve para nenhum dos dois.
- O prompt da entrega recebe: a promessa feita no CTA do roteiro, a persona
  (`personas.voice_prompt`, `forbidden_rules`), e a etapa de funil. **O que a entrega precisa
  cumprir é a promessa literal do roteiro** — se o vídeo prometeu "mapa de 7 passos", a entrega
  tem 7 passos. Passe o CTA gerado, não o tema.
- Devolva a entrega **mesmo se falhar ao gravar**. É a regra que o gerador de roteiro já segue,
  pelo motivo declarado no código: o dono já pagou a geração; esconder o texto o faria pagar de
  novo.
- Grave sempre com `status: 'draft'`.

## Fase 3 — A página pública

Rota `/e/[slug]` — curta de propósito, porque vai ser colada em DM.

**Esta rota precisa entrar em `PUBLIC_PATHS` (`src/proxy.ts`), e o `CLAUDE.md` diz que não se
adiciona rota pública sem defesa própria.** A defesa aqui, escreva-a no comentário ao lado da
entrada, como as outras têm:

- só `GET`, nada de mutação;
- só `status = 'published'` — rascunho responde 404, não 403 (403 confirma que existe);
- slug não enumerável;
- não há dado sensível: é material de marketing feito para ser distribuído.

**Rastreio de quem abriu.** O link mandado na DM leva `?c=<token>`.

- **Nunca** ponha o UUID do contato cru na URL. Vaza no histórico, no referrer, e qualquer um
  forja o de outra pessoa.
- Assine: `token = base64url(contact_id) + '.' + hmac`. O projeto já tem esse padrão exato em
  `src/lib/auth.ts` (`signSession` / `isValidSession`) — siga-o, com um segredo próprio.
- Token inválido ou ausente **não bloqueia a página**. Registra a visita com `contact_id` nulo e
  serve o conteúdo. A pessoa veio buscar o presente prometido; barrá-la por causa de telemetria
  seria trocar a entrega pela métrica. (É a mesma regra que o resto do projeto segue: métrica é
  acessório, entrega não.)
- A escrita em `delivery_views` vai **sem `await` bloqueante**, com erro para `console.error`,
  como toda métrica aqui.

Renderize os blocos com componentes nossos, na direção visual "Marcador" (`src/app/globals.css`).
Mobile primeiro: quase todo mundo abre pelo celular, dentro do navegador do Instagram.

**Cuidado com a armadilha de camada do Tailwind 4** documentada no topo do `globals.css`:
`.surface-panel` / `.chrome-panel` / `.pop-panel` não estão em `@layer`, então vencem
`@layer utilities` — `bg-*` e `hover:border-*` aplicados por cima delas somem sem avisar.

## Fase 4 — Vincular à automação

- `flows.delivery_id` aponta para a entrega.
- A variável **`{{presente}}`** interpola para a URL completa, com o token do contato.
  A interpolação vive em `interpolate()`, `src/lib/flow/engine.ts:42`.
- **Invariante que você vai encostar:** a interpolação roda **antes** do spin. É o que faz
  `{Toma o link {{presente}}|Segue o link {{presente}}}` funcionar. Não inverta a ordem, e
  confirme que `variantCount`/`splitVariations` continuam mascarando a variável nova
  (`src/lib/flow/variation.ts`) — validador que mede o template cru rejeita texto que funciona.
- No editor do fluxo, ofereça a entrega vinculada num seletor. Quem escrever `{{presente}}` sem
  entrega vinculada precisa ver o aviso **no editor**, não descobrir por DM vazia. Use
  `src/lib/flow/leaks.ts`, que já é o lugar dos avisos de "isto vai perder gente".

## Fase 5 — A aba na biblioteca

Aba **"Entregas"** em `/biblioteca`: lista, status, visitas, botão de publicar, link de copiar.

No card do item da biblioteca, ao lado de "Gerar roteiro": mostrar se aquele roteiro já tem
entrega, e levar até ela.

---

## Definição de pronto

- [ ] `npx tsc --noEmit && npm run lint && npm test && npm run build` — quatro verdes
- [ ] Testes novos: geração de slug (colisão e caracteres estranhos no título), assinatura do
      token de contato (forjado é rejeitado), render de cada tipo de bloco, `{{presente}}`
      interpolando antes do spin
- [ ] A migration foi **escrita** e o dono **avisado** — não aplicada por você
- [ ] Uma entrega real publicada e aberta pelo celular, pelo link com token, e a visita apareceu
      em `delivery_views`
- [ ] A automação `mapa` migrada para uma entrega nossa, e o 404 morto

## O que NÃO fazer

- Não deixe o modelo devolver HTML.
- Não sirva rascunho na rota pública.
- Não bloqueie a página quando o token for inválido.
- Não aplique a migration.
- Não mexa no polling (`src/lib/webhook/poll.ts`) — nada nesta feature precisa dele, e é o que
  sustenta a produção inteira.
