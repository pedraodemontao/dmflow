-- O carrossel nasce na mesma tabela do roteiro.
--
-- `scripts` guarda a saída de IA validada por schema Zod — até agora sempre um
-- roteiro de Reel. O card 05 gera uma segunda FORMA de conteúdo (carrossel de
-- imagens), mas a peça continua sendo "saída de IA gravada com output/
-- model_used/tokens_in/tokens_out" — criar `carousels` seria uma segunda
-- `scripts` com outro nome, e `publications.script_id` (card 04) já aponta
-- para `scripts`, não para uma tabela nova.
--
-- Default `'reel'` para toda linha existente continuar válida sem backfill:
-- as 0022 linhas anteriores a esta migration SÃO roteiro de Reel, e o texto
-- diz isso sem precisar tocar nelas.
alter table public.scripts
  add column if not exists kind text not null default 'reel'
  check (kind in ('reel', 'carousel'));

comment on column public.scripts.kind is
  'reel (roteiro falado) ou carousel (slides lidos, card 05). Mesma tabela, forma diferente de output.';
