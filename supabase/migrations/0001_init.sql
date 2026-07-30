-- dm-flow :: schema inicial
-- Automação de DM/comentário do Instagram. Uso próprio (single-tenant por enquanto),
-- mas accounts já isola por conta conectada para virar multi-tenant sem migration destrutiva.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- accounts: cada conta Instagram profissional conectada via OAuth
-- ---------------------------------------------------------------------------
create table public.accounts (
  id                uuid primary key default gen_random_uuid(),
  ig_user_id        text not null unique,
  username          text,
  access_token      text not null,
  token_expires_at  timestamptz not null,
  scopes            text[] not null default '{}',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- contacts: quem interagiu com a conta. last_inbound_at controla a janela de 24h
-- ---------------------------------------------------------------------------
create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts(id) on delete cascade,
  ig_user_id       text not null,
  username         text,
  name             text,
  tags             text[] not null default '{}',
  fields           jsonb not null default '{}'::jsonb,
  last_inbound_at  timestamptz,
  subscribed       boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (account_id, ig_user_id)
);

create index contacts_tags_idx on public.contacts using gin (tags);

-- ---------------------------------------------------------------------------
-- flows: definição do fluxo em JSON ({ entry, nodes })
-- ---------------------------------------------------------------------------
create table public.flows (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  name        text not null,
  definition  jsonb not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- triggers: o que dispara um fluxo
-- ---------------------------------------------------------------------------
create type public.trigger_type as enum ('keyword', 'comment', 'story_reply', 'default');
create type public.match_mode as enum ('exact', 'contains', 'starts_with');

create table public.triggers (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  flow_id     uuid not null references public.flows(id) on delete cascade,
  type        public.trigger_type not null,
  keywords    text[] not null default '{}',
  match_mode  public.match_mode not null default 'contains',
  -- só para type = 'comment'. null = vale para qualquer post/reel
  media_id    text,
  -- resposta pública opcional no próprio comentário antes da DM privada
  public_reply text,
  priority    int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index triggers_lookup_idx on public.triggers (account_id, type, is_active, priority desc);

-- ---------------------------------------------------------------------------
-- flow_runs: estado de um contato dentro de um fluxo (a state machine)
-- ---------------------------------------------------------------------------
create type public.run_status as enum ('running', 'waiting_reply', 'sleeping', 'done', 'failed');

create table public.flow_runs (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  flow_id       uuid not null references public.flows(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  current_node  text,
  status        public.run_status not null default 'running',
  -- para nós de delay: quando o cron deve retomar
  resume_at     timestamptz,
  context       jsonb not null default '{}'::jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- um contato só roda um fluxo por vez
create unique index flow_runs_active_idx
  on public.flow_runs (contact_id)
  where status in ('running', 'waiting_reply', 'sleeping');

create index flow_runs_resume_idx
  on public.flow_runs (resume_at)
  where status = 'sleeping';

-- ---------------------------------------------------------------------------
-- messages: log de entrada e saída. mid faz dedup de reentrega do webhook
-- ---------------------------------------------------------------------------
create type public.message_direction as enum ('in', 'out');

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete cascade,
  direction   public.message_direction not null,
  mid         text,
  text        text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Único SEM cláusula where: o upsert onConflict do PostgREST não casa com
-- índice parcial e falha em silêncio. Postgres permite vários NULLs num único.
create unique index messages_mid_idx on public.messages (mid);
create index messages_contact_idx on public.messages (contact_id, created_at desc);

-- ---------------------------------------------------------------------------
-- webhook_events: fila leve. O webhook grava e responde 200 na hora;
-- o processamento roda em background (after()) e o cron varre o que sobrou.
-- ---------------------------------------------------------------------------
create type public.event_status as enum ('pending', 'processing', 'done', 'failed');

create table public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  dedup_key     text not null unique,
  payload       jsonb not null,
  status        public.event_status not null default 'pending',
  attempts      int not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index webhook_events_pending_idx
  on public.webhook_events (created_at)
  where status in ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger accounts_touch  before update on public.accounts  for each row execute function public.touch_updated_at();
create trigger contacts_touch  before update on public.contacts  for each row execute function public.touch_updated_at();
create trigger flows_touch     before update on public.flows     for each row execute function public.touch_updated_at();
create trigger flow_runs_touch before update on public.flow_runs for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: ligada em tudo, sem policy. Só a service_role (que bypassa RLS) escreve.
-- Quando existir login de usuário, adicionar owner_id + policies aqui.
-- ---------------------------------------------------------------------------
alter table public.accounts       enable row level security;
alter table public.contacts       enable row level security;
alter table public.flows          enable row level security;
alter table public.triggers       enable row level security;
alter table public.flow_runs      enable row level security;
alter table public.messages       enable row level security;
alter table public.webhook_events enable row level security;
