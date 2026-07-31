-- dm-flow :: captura total de comentários
--
-- O polling tinha três buracos que faziam PERDER LEAD em silêncio, e todos
-- pioravam quanto mais o post viralizasse:
--   1. só varria os 10 posts mais recentes  → post antigo que volta a circular ficava mudo
--   2. só 25 comentários por post, sem paginação → post com 60 comentários processava 25
--   3. só olhava 1 hora para trás → cron parado 2h (deploy, token morto) perdia tudo no buraco
--
-- O cursor resolve o 3: em vez de "última hora", varre desde a última vez que
-- deu certo. Se o sistema ficar parado 22 horas — como em 30/07 — ele recupera
-- tudo ao voltar, em vez de fingir que nada aconteceu.

alter table public.accounts
  add column comments_cursor timestamptz,
  add column messages_cursor timestamptz;

-- Qual post gerou cada envio, para medir resposta pública por post.
alter table public.send_log
  add column media_id text;

create index send_log_media_window_idx
  on public.send_log (media_id, created_at desc)
  where media_id is not null;

-- ---------------------------------------------------------------------------
-- Fila de respostas públicas
--
-- TODO comentário é respondido — nenhum é descartado. O que muda é o RITMO:
-- dezenas de respostas iguais no mesmo post, em minutos, é o padrão que fez a
-- Meta apagar os comentários em 30/07. Então a DM sai na hora (é conversa
-- privada, não incomoda ninguém) e a resposta pública entra aqui para sair
-- espaçada, no teto por post.
--
-- Comentário não expira como a private reply (7 dias), então demorar é seguro.
-- ---------------------------------------------------------------------------
create table public.pending_public_replies (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  comment_id  text not null unique,
  media_id    text,
  message     text not null,
  attempts    int not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

-- Drenagem: pega as mais antigas ainda não enviadas.
create index pending_public_replies_queue_idx
  on public.pending_public_replies (created_at)
  where sent_at is null;

alter table public.pending_public_replies enable row level security;

-- ---------------------------------------------------------------------------
-- Índices apontados pela auditoria: chave estrangeira sem índice faz a cascata
-- de exclusão varrer a tabela inteira.
-- ---------------------------------------------------------------------------
create index if not exists flow_node_events_contact_fk_idx on public.flow_node_events (contact_id);
create index if not exists flow_node_events_run_fk_idx     on public.flow_node_events (run_id);
create index if not exists flow_runs_contact_idx           on public.flow_runs (contact_id, created_at desc);
create index if not exists flow_runs_flow_idx              on public.flow_runs (flow_id, status);
create index if not exists triggers_flow_fk_idx            on public.triggers (flow_id);
create index if not exists flows_account_fk_idx            on public.flows (account_id);
create index if not exists contacts_source_id_idx          on public.contacts (source_id);
create index if not exists contacts_whatsapp_idx           on public.contacts ((fields->>'whatsapp'));

-- Redundantes: prefixo exato de outro índice, só peso morto em cada escrita.
drop index if exists public.messages_thread_idx;
drop index if exists public.flow_node_events_flow_idx;
