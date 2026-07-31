-- dm-flow :: métricas por bloco
-- Registra a passagem de cada contato por cada nó, para enxergar o funil
-- do fluxo — onde as pessoas param — em vez de só "disparou / concluiu".

create table public.flow_node_events (
  id          uuid primary key default gen_random_uuid(),
  flow_id     uuid not null references public.flows(id) on delete cascade,
  run_id      uuid not null references public.flow_runs(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  node_id     text not null,
  node_type   text not null,
  created_at  timestamptz not null default now()
);

-- Consulta principal: contagem por nó de um fluxo.
create index flow_node_events_flow_idx on public.flow_node_events (flow_id, node_id);
-- Um contato pode repassar pelo mesmo nó (repergunta do `ask`); para contar
-- "quantas pessoas chegaram aqui" o distinct é por contato.
create index flow_node_events_contact_idx on public.flow_node_events (flow_id, node_id, contact_id);

alter table public.flow_node_events enable row level security;
