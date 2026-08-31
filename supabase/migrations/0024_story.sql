-- Story entra na régua de publicação.
--
-- A API de publicação aceita `media_type=STORIES` com os mesmos três passos
-- do feed (container → status → publish). O que muda é a moldura: 9:16 em
-- vez de 4:5–1.91:1, sem legenda (story não tem caption via API) e sem
-- comentário — logo sem gatilho para clonar.
--
-- O nome do constraint é o que o Postgres gerou para o check inline da 0021.
alter table public.publications drop constraint if exists publications_kind_check;
alter table public.publications add constraint publications_kind_check
  check (kind in ('image', 'carousel', 'reel', 'story'));
