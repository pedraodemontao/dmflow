-- Biblioteca de referência de conteúdo.
--
-- O dono cadastra perfis do nicho dele; a raspagem (Apify) traz os reels de
-- cada um e a ferramenta ordena por OUTLIER — quantas vezes o vídeo passou da
-- mediana daquele mesmo perfil.
--
-- O outlier é o número que importa, e o motivo é escala: 100 mil views num
-- perfil de 1 milhão de seguidores é rotina; num perfil de 5 mil é um evento.
-- Views absolutas comparam perfis de tamanhos diferentes e mentem. A mediana
-- do próprio perfil é a régua honesta, e por isso ela vive em
-- `tracked_profiles` e é recalculada a cada raspagem.
--
-- Nada aqui usa o token do Instagram do dono. A raspagem roda na
-- infraestrutura da Apify, com a identidade deles, sobre conteúdo público — a
-- conta restringida em jul/2026 não participa e não corre risco novo.

create table public.tracked_profiles (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  -- Sem "@": o que a API da Apify espera e o que evita duplicar o mesmo perfil
  -- escrito de dois jeitos.
  username      text not null,
  -- Rótulo livre do dono ("br-ia-negocios", "infoproduto"). Texto e não enum
  -- de propósito: o nicho dele muda mais rápido que o schema.
  category      text,
  is_active     boolean not null default true,
  last_scraped_at timestamptz,
  -- Mediana de views dos itens já raspados deste perfil. Derivada e gravada
  -- para o ranking não recalcular a cada leitura; refeita a cada raspagem.
  median_views  bigint,
  created_at    timestamptz not null default now(),
  unique (account_id, username)
);

create table public.library_items (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  profile_id    uuid not null references public.tracked_profiles(id) on delete cascade,
  -- Identidade na origem (shortcode do Instagram). É o que impede a mesma
  -- publicação entrar duas vezes quando a raspagem repete.
  post_id       text not null,
  url           text not null,
  -- URL ASSINADA QUE EXPIRA, mesma lição de `contacts.profile_pic_url`
  -- (migration 0012): nunca trate como permanente, e sempre tenha fallback
  -- visual para quando morrer.
  thumbnail_url text,
  caption       text,
  posted_at     timestamptz,
  views         bigint,
  likes         bigint,
  comments      bigint,
  -- Derivados gravados: `(likes + comments) / views` e `views / mediana`.
  -- Guardados porque a ordenação da tela depende deles e recalcular em SQL a
  -- cada abertura sairia caro sem ganho nenhum.
  engagement    numeric,
  outlier       numeric,
  -- Marcado pelo dono quando já assistiu. É dele, não vem da raspagem.
  watched       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id, post_id)
);

-- Consulta principal da tela: os maiores outliers da conta, com filtro opcional
-- de categoria (que vive no perfil, daí o join).
create index library_items_outlier_idx on public.library_items (account_id, outlier desc nulls last);
create index library_items_profile_idx on public.library_items (profile_id);

alter table public.tracked_profiles enable row level security;
alter table public.library_items enable row level security;

-- Mesmo gatilho de `updated_at` que as outras tabelas usam (ver 0001_init).
create trigger library_items_touch
  before update on public.library_items
  for each row execute function public.touch_updated_at();
