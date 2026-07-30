-- dm-flow :: blindagem anti-spam
-- Camadas contra flag da Meta: jitter no processamento de comentários e
-- teto de envios por hora. Regras no CLAUDE.md (invariantes).

-- Evento de comentário só é processado depois de process_after
-- (30–120s de jitter — resposta instantânea é assinatura de bot).
alter table public.webhook_events
  add column process_after timestamptz not null default now();

create index webhook_events_due_idx
  on public.webhook_events (process_after)
  where status = 'pending';

-- Log de todo envio (DM, private reply, resposta pública) para o cap por hora.
create table public.send_log (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  kind        text not null check (kind in ('dm', 'private_reply', 'public_reply')),
  created_at  timestamptz not null default now()
);

create index send_log_window_idx on public.send_log (account_id, created_at desc);

alter table public.send_log enable row level security;
