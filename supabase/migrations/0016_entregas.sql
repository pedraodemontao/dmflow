-- Entregas: o material que o roteiro prometeu, publicado numa página nossa.
--
-- Hoje o link que a automação manda mora fora do sistema — ninguém o gera,
-- ninguém o versiona, ninguém sabe se ele ainda existe. A automação `mapa`
-- está ATIVA em produção mandando um link que devolve 404. Do ponto de vista
-- do sistema isso é sucesso: a DM foi enviada. Esta migration fecha essa
-- lacuna: a entrega passa a nascer no banco, com URL estável.
create table if not exists public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  -- Apagar o roteiro ou o item de origem não pode derrubar uma entrega que já
  -- está circulando em DM.
  script_id       uuid references public.scripts(id) on delete set null,
  library_item_id uuid references public.library_items(id) on delete set null,
  -- kebab-do-título + 6 caracteres aleatórios. Sequencial ou previsível deixa
  -- qualquer um enumerar tudo que já foi entregue — a página é pública.
  slug            text not null unique,
  title           text not null,
  subtitle        text,
  -- Blocos tipados, nunca HTML: o conteúdo vem de um modelo de linguagem, e
  -- HTML livre de modelo é XSS servido na própria página.
  blocks          jsonb not null default '[]'::jsonb,
  cta_label       text,
  cta_url         text,
  -- Roteiro gerado nem sempre presta. A entrega só fica no ar quando o dono
  -- publicar, e a rota pública só serve 'published'.
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Tabela separada do mesmo motivo que `button_clicks` não vive dentro de
-- `flow_node_events` (ver migration 0013): um contador agregado responde
-- "quantos", e a pergunta que interessa aqui é "quem, e quando".
create table if not exists public.delivery_views (
  id          bigserial primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.flows
  add column if not exists delivery_id uuid references public.deliveries(id) on delete set null;

-- Consulta principal da aba "Entregas": listar por conta, mais recente primeiro.
create index if not exists deliveries_account_idx on public.deliveries (account_id, created_at desc);
-- Contagem e listagem de visitas por entrega.
create index if not exists delivery_views_delivery_idx on public.delivery_views (delivery_id, created_at desc);
-- Mesmo padrão de `messages_contact_idx` (migration 0001): sem isso,
-- `resetTestData` apagando todos os `contacts` de uma vez varre
-- `delivery_views` inteira sem índice a cada `on delete set null`.
create index if not exists delivery_views_contact_idx on public.delivery_views (contact_id);

alter table public.deliveries enable row level security;
alter table public.delivery_views enable row level security;
