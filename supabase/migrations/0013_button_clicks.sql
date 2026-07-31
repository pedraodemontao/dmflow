-- Cliques por botão.
--
-- Até aqui o funil sabia que a pessoa PASSOU pelo bloco de botões, nunca QUAL
-- botão ela apertou. Se o bloco oferece "Quero o mapa" e "Depois eu vejo", as
-- duas escolhas contavam igual — e é justamente a diferença entre elas que diz
-- o que escrever no próximo post.
--
-- Por que tabela nova e não coluna em `flow_node_events`: aquela tabela conta
-- PASSAGEM por bloco e o funil de métricas depende de contar linha por nó. Uma
-- linha de clique lá dentro inflaria o funil — a pessoa apareceria duas vezes
-- no mesmo bloco. São eventos de natureza diferente.
create table public.button_clicks (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  -- Nulos quando o payload não casa com botão nenhum das definições atuais:
  -- botão apagado depois do envio, ou toque de ice breaker (que não vem de
  -- bloco de fluxo). O clique é registrado assim mesmo — perder o dado seria
  -- pior que não saber a origem dele.
  flow_id     uuid references public.flows(id) on delete set null,
  node_id     text,
  -- O que a Meta devolveu no toque. É por ele que a origem é resolvida.
  payload     text not null,
  -- Rótulo que a pessoa viu, copiado da definição no momento da resolução.
  -- Guardado junto de propósito: se o texto do botão mudar depois, o histórico
  -- continua contando o que estava escrito na hora do clique.
  title       text,
  created_at  timestamptz not null default now()
);

-- Consulta principal: cliques de um fluxo, agrupados por nó e payload.
create index button_clicks_flow_idx on public.button_clicks (flow_id, node_id);
-- Série ao longo do tempo e limpeza por conta.
create index button_clicks_account_idx on public.button_clicks (account_id, created_at desc);

alter table public.button_clicks enable row level security;
