-- Carrossel entra na biblioteca, com régua própria.
--
-- A ingestão descartava Sidecar na porta ("a biblioteca serve para modelar
-- reel") — e o dono tem perfil de referência que vive de carrossel. O que
-- não muda: a régua de PLAYS continua sendo só de vídeo. Carrossel não tem
-- play, e misturar as réguas inventaria outlier onde não há.
--
-- A régua do carrossel é a MEDIANA DE CURTIDAS dos carrosséis do próprio
-- perfil — mesmo raciocínio do plays: "quantas vezes acima do normal DELE",
-- nunca comparação entre perfis. bigint como median_plays, e o código
-- ARREDONDA antes de gravar: mediana de lista par tem meio, o Postgres
-- recusa, e o perfil fica sem régua em silêncio (incidente de 01/08).
alter table public.tracked_profiles
  add column if not exists median_carousel_likes bigint;

comment on column public.tracked_profiles.median_carousel_likes is
  'Régua do outlier de carrossel: mediana de CURTIDAS dos Sidecar deste perfil, refeita a cada raspagem. Nula sem amostra.';
