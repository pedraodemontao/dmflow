-- Biblioteca de referência de conteúdo + a "inteligência" do gerador.
--
-- PORTE, não invenção: o schema vem do projeto `paInel-nocode-pedro`
-- (../paInel-nocode-pedro/supabase/migrations/0001_init.sql), onde a feature já
-- existe e roda. Uma primeira versão desta migration foi escrita do zero e
-- descartada — reinventava `library_items` mais pobre, sem `visual_format`,
-- `hook_text` nem `structure`, que são justamente o que torna um vídeo
-- MODELÁVEL em vez de só listável.
--
-- PRINCÍPIO CENTRAL, herdado de lá: a inteligência do gerador é DADO, não
-- código. Voz, proibições e formato vivem em `personas`; o CTA em
-- `funnel_stages`; os temas em `content_pillars`; o grounding em
-- `library_items`. Nenhum prompt fica escrito no código — o system prompt é
-- montado a partir destas tabelas. É o que permite mudar de nicho editando
-- linhas em vez de reescrever o gerador.
--
-- ADAPTAÇÃO ao dm-flow: lá o isolamento é `user_id = auth.uid()` com Supabase
-- Auth (multiusuário). Aqui é single-tenant com `service_role` e RLS ligada sem
-- policy nenhuma — o proxy com `PANEL_PASSWORD` é quem tranca. Então
-- `user_id` vira `account_id`, e não existe policy por dono. Trazer o Auth
-- junto significaria reescrever a autenticação do dm-flow inteiro.
--
-- A raspagem NÃO usa o token do Instagram do dono: roda na infraestrutura da
-- Apify, com a identidade deles, sobre conteúdo público. A conta restringida em
-- jul/2026 não participa.

do $$ begin
  create type funnel_stage_key as enum ('topo', 'meio', 'fundo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type library_source as enum ('instagram', 'youtube', 'manual');
exception when duplicate_object then null; end $$;

-- ============================================================
-- personas — a unidade de parametrização do gerador
-- ============================================================
create table public.personas (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  name               text not null,
  niche              text not null,
  voice_prompt       text not null default '',
  forbidden_rules    text[] not null default '{}',
  format_rules       text not null default '',
  named_mechanisms   jsonb not null default '[]',
  recording_guidance text not null default '',
  headline_formula   text not null default '',
  /** Oferta de fundo de funil — calibra o CTA que o gerador escreve. */
  offer              text not null default '',
  /** A palavra que o lead comenta para entrar na automação. Liga a biblioteca ao resto do produto. */
  cta_keyword        text not null default '',
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ============================================================
-- funnel_stages — o CTA muda conforme a etapa
-- ============================================================
create table public.funnel_stages (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  persona_id      uuid not null references public.personas(id) on delete cascade,
  key             funnel_stage_key not null,
  label           text not null,
  cta_instruction text not null,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (persona_id, key)
);

-- ============================================================
-- content_pillars — os temas recorrentes do nicho
-- ============================================================
create table public.content_pillars (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.accounts(id) on delete cascade,
  persona_id           uuid not null references public.personas(id) on delete cascade,
  name                 text not null,
  description          text not null default '',
  default_funnel_stage funnel_stage_key,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now()
);

-- ============================================================
-- tracked_profiles — de quem a raspagem puxa
-- ============================================================
-- Não existe no projeto de origem: lá a lista de perfis mora num arquivo
-- (`data/perfis.json`) lido pelo script de linha de comando. Aqui a raspagem
-- dispara por botão na tela, então a lista precisa ser editável pelo painel —
-- e a mediana de views por perfil precisa de um lugar para viver.
create table public.tracked_profiles (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  /** Sem "@": é o que a Apify espera e o que evita o mesmo perfil duas vezes. */
  username        text not null,
  /** Rótulo livre. Texto e não enum: o nicho muda mais rápido que o schema. */
  category        text,
  is_active       boolean not null default true,
  last_scraped_at timestamptz,
  /**
   * Régua do outlier: a MEDIANA de PLAYS deste perfil, refeita a cada raspagem.
   * Mediana e não média porque um único viral puxaria a média e passaria a
   * esconder todo outlier seguinte daquele mesmo perfil.
   */
  median_plays    bigint,
  created_at      timestamptz not null default now(),
  unique (account_id, username)
);

-- ============================================================
-- library_items — o acervo e o grounding do gerador
-- ============================================================
create table public.library_items (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  persona_id    uuid references public.personas(id) on delete set null,
  profile_id    uuid references public.tracked_profiles(id) on delete set null,
  source        library_source not null default 'instagram',
  owner_handle  text,
  category      text,
  post_type     text,
  external_url  text not null,
  /**
   * URL ASSINADA QUE EXPIRA — mesma lição de `contacts.profile_pic_url`
   * (migration 0012). Nunca trate como permanente; a tela precisa de fallback.
   */
  thumb_url     text,
  /**
   * O Instagram devolve DUAS contagens e elas divergem muito: num teste real,
   * `videoViewCount` deu 4.719 e `videoPlayCount` deu 112.806 no mesmo vídeo —
   * 24 vezes maior. "Plays" é o número que aparece publicamente no reel e o que
   * o nicho usa para comparar; "views" é uma contagem mais restrita. Guardamos
   * as duas e o outlier é calculado sobre `plays`, que é a régua que todo mundo
   * enxerga. Gravar só uma delas tornaria impossível auditar a conta depois.
   */
  views         bigint not null default 0,
  plays         bigint not null default 0,
  likes         bigint not null default 0,
  comments      bigint not null default 0,
  duration_sec  int,
  caption       text not null default '',
  posted_at     timestamptz,
  /**
   * O que torna o vídeo MODELÁVEL em vez de só listável. Vem do enriquecimento
   * por IA, não da raspagem: `visual_format` (talking_head, tela_dividida,
   * screencast), o gancho literal e o arco do vídeo.
   */
  visual_format text,
  format_desc   text,
  hook_text     text,
  structure     text,
  /** Derivados. Ver `src/lib/library/outlier.ts` para a matemática e o porquê. */
  engagement    numeric,
  outlier       numeric,
  /** Marcado pelo dono. Não vem da raspagem. */
  watched       boolean not null default false,
  scraped_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  /** Identidade na origem: é o que impede a mesma publicação entrar duas vezes. */
  unique (account_id, external_url)
);

create index library_items_outlier_idx on public.library_items (account_id, outlier desc nulls last);
create index library_items_plays_idx   on public.library_items (account_id, plays desc);
create index library_items_profile_idx on public.library_items (profile_id);
-- Busca textual em português: é a base do RAG antes de existir embedding.
create index library_items_fts_idx on public.library_items
  using gin (to_tsvector('portuguese', coalesce(caption, '') || ' ' || coalesce(structure, '')));

-- ============================================================
-- scripts — os roteiros gerados
-- ============================================================
create table public.scripts (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null references public.accounts(id) on delete cascade,
  persona_id             uuid references public.personas(id) on delete set null,
  pillar_id              uuid references public.content_pillars(id) on delete set null,
  funnel_stage           funnel_stage_key,
  theme                  text,
  duration               text,
  /** O vídeo que serviu de molde. `set null` para apagar o item não levar o roteiro junto. */
  source_library_item_id uuid references public.library_items(id) on delete set null,
  /** Saída validada por schema Zod — ver `src/lib/ai/schemas.ts` no projeto de origem. */
  output                 jsonb not null,
  model_used             text,
  tokens_in              int,
  tokens_out             int,
  created_at             timestamptz not null default now()
);

create index scripts_recent_idx on public.scripts (account_id, created_at desc);

alter table public.personas        enable row level security;
alter table public.funnel_stages   enable row level security;
alter table public.content_pillars enable row level security;
alter table public.tracked_profiles enable row level security;
alter table public.library_items   enable row level security;
alter table public.scripts         enable row level security;

create trigger personas_touch      before update on public.personas      for each row execute function public.touch_updated_at();
create trigger library_items_touch before update on public.library_items for each row execute function public.touch_updated_at();
