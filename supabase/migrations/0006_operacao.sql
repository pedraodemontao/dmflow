-- dm-flow :: controles de operação
-- Botão de pânico e horário de atendimento. Ambos moram na conta porque o
-- schema já isola por account_id — no dia do multi-conta, cada uma tem o seu.

alter table public.accounts
  -- Pânico: nenhuma automação dispara enquanto true. Não desativa nada,
  -- então destravar devolve exatamente o estado anterior.
  add column automations_paused boolean not null default false,
  -- Silêncio noturno, hora cheia em America/Sao_Paulo. Null nos dois = sempre ativo.
  -- Evento que cai no silêncio não é perdido: espera a abertura.
  add column quiet_from smallint check (quiet_from between 0 and 23),
  add column quiet_to   smallint check (quiet_to between 0 and 23);
