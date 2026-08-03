-- A biblioteca passa a guardar POR QUE o vídeo funcionou, não só quanto.
--
-- Diagnóstico de 03/08/2026: os campos de análise (`hook_text`, `structure`,
-- `visual_format`, `format_desc`) existem desde a migration 0014 e estavam com
-- ZERO de 40 preenchidos. O gerador de roteiro, que promete "modelar o vídeo
-- que performou", recebia uma legenda de uma linha e inventava o resto — foi
-- assim que nasceu um roteiro afirmando "eu testei e caiu de R$40 para R$12"
-- sobre um teste que nunca houve.
--
-- A raspagem já paga por 28 campos e guardava 12. Os que entram agora são os
-- que respondem à pergunta certa:
--
--   comentários     o que o vídeo PROVOCOU — a dúvida que ficou, o que pediram,
--                   onde a pessoa travou. É o sinal mais honesto de por que
--                   funcionou, e não depende de adivinhar a partir da legenda.
--   paidPartnership publi teve empurrão pago: comparar o desempenho dela com o
--                   de post orgânico na mesma mediana mistura duas coisas.
--   dimensões       9:16 contra quadrado muda o formato, e formato é metade da
--                   decisão de como gravar.
--   hashtags        tema declarado pelo autor, de graça.
alter table public.library_items
  add column if not exists top_comments      jsonb not null default '[]'::jsonb,
  add column if not exists hashtags          text[] not null default '{}',
  add column if not exists is_paid_partnership boolean not null default false,
  add column if not exists aspect_ratio      numeric,
  -- Quando a análise rodou. Nulo = nunca analisado, e é o que a fila lê para
  -- saber o que falta. Distinto de `scraped_at`: raspar traz número, analisar
  -- traz leitura, e as duas envelhecem em ritmos diferentes.
  add column if not exists analyzed_at       timestamptz,
  -- Qual modelo produziu a análise. Sem isso não há como comparar duas
  -- rodadas nem saber o que reprocessar quando o modelo melhorar — foi a falta
  -- exata que fez a primeira geração de roteiro ficar sem rastro de origem.
  add column if not exists analysis_model    text;

comment on column public.library_items.top_comments is
  'Comentários do post, como a Apify devolve. É o que responde POR QUE o vídeo funcionou — a legenda raramente responde.';

comment on column public.library_items.analyzed_at is
  'Nulo = nunca analisado. A fila de análise lê esta coluna; não confunda com scraped_at.';

-- A fila de análise: o que ainda não foi lido, mais recente primeiro.
create index if not exists library_items_unanalyzed_idx
  on public.library_items (account_id, analyzed_at)
  where analyzed_at is null;
