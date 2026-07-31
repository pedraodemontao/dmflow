-- dm-flow :: origem do lead
-- De qual conteúdo a pessoa veio. O id do post já chegava no evento de
-- comentário e era descartado; agora fica gravado no contato.
--
-- É primeiro toque: só grava quando ainda está vazio. Quem comenta em três
-- reels continua atribuído ao que trouxe, não ao último em que interagiu.

alter table public.contacts
  add column source_type     text check (source_type in ('comment', 'ref', 'ad')),
  -- Para 'comment' é o id da mídia; deixado genérico para o dia em que o
  -- webhook entregar `ref` de link de referência e `ad_id` de anúncio.
  add column source_id       text,
  add column source_at       timestamptz;

create index contacts_source_idx on public.contacts (source_type, source_id);
