-- O elo que faltava entre a biblioteca e os insights.
--
-- Os posts do próprio dono agora vivem em `library_items` (legenda, análise,
-- duração) e os números deles em `media_insights` (views, retenção). Só que
-- as duas tabelas não tinham como se encontrar:
--
--   library_items.external_url  https://www.instagram.com/reel/DSBcyr6jf2y/
--   media_insights.media_id     18109404692003644
--
-- Uma guarda o SHORTCODE, a outra o ID NUMÉRICO, e nenhum dos dois contém o
-- outro. A primeira versão do cruzamento tentou casar por `url.includes(id)`
-- e casou zero linhas — o bloco de aprendizado saiu com todas as legendas
-- vazias, ou seja, número sem conteúdo, que não ensina nada a quem escreve
-- roteiro.
--
-- A coluna é preenchida na sincronização (`sync-own.ts`), onde os dois valores
-- chegam juntos na mesma resposta da Graph API. Fica nula para item raspado da
-- Apify: post de terceiro não tem insight nosso, e inventar um id ali só
-- criaria a ilusão de vínculo.
alter table public.library_items
  add column if not exists platform_media_id text;

comment on column public.library_items.platform_media_id is
  'O id numérico da mídia na Graph API — a chave que liga este item a media_insights. Nulo em post de terceiro.';

create index if not exists library_items_platform_media_idx
  on public.library_items (account_id, platform_media_id)
  where platform_media_id is not null;
