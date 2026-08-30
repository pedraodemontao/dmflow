-- Publicações: o post nasce dentro do painel, o tick publica.
--
-- Hoje o post nasce FORA do sistema — o dono grava, sobe pelo app do
-- Instagram, e só depois abre o painel pra criar a automação e apontar
-- `triggers.media_id` pro post. Isso já produziu bug sem erro e sem log em
-- produção: automação com media_id preso a um post antigo não dispara no
-- post novo, o matcher (`triggers.ts`) descarta em silêncio, e o tick
-- responde ok:true com a automação "ativa" no painel. Esta migration fecha
-- essa lacuna: o post nasce aqui, e o gatilho nasce junto (fase 5 do card).
create table if not exists public.publications (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  kind               text not null check (kind in ('image', 'carousel', 'reel')),
  caption            text not null default '',
  -- CAMINHOS no bucket, nunca URLs — mesma regra de deliveries (migration
  -- 0016) e do file-url.ts: URL guardada no banco é phishing servido do
  -- próprio domínio esperando acontecer.
  media_paths        text[] not null default '{}',
  cover_path         text,
  status             text not null default 'draft'
                     check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at       timestamptz,
  published_at       timestamptz,
  -- A Meta cria o container do lado dela. `maxDuration` do tick é 300s e
  -- vídeo pode levar minutos pra processar; se o tick morrer no meio, uma
  -- retentativa que recrie containers do zero produz post DUPLICADO quando o
  -- anterior também chega a publicar. Gravar { children: [...], parent: '...' }
  -- e retomar do que já existe é o mesmo princípio de `startFlow` retomando
  -- run `failed` pelo `current_node` em vez de recomeçar do `entry`.
  container_ids      jsonb not null default '{}'::jsonb,
  platform_media_id  text,
  permalink          text,
  attempts           int not null default 0,
  error              text,
  -- Automação cujo gatilho de comentário é CLONADO (não redirecionado) pro
  -- post novo, com media_id preenchido — fase 5 do card 04.
  flow_id            uuid references public.flows(id) on delete set null,
  script_id          uuid references public.scripts(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Consulta da drenagem no tick: pendentes de uma conta, mais antigo primeiro.
create index if not exists publications_queue_idx
  on public.publications (account_id, status, scheduled_at);

alter table public.publications enable row level security;
