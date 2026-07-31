-- dm-flow :: inbox de atendimento
-- Fila de trabalho de verdade: resolver, adiar, anotar e responder com atalho.

alter table public.contacts
  add column inbox_status text not null default 'open'
    check (inbox_status in ('open', 'snoozed', 'done')),
  add column snooze_until timestamptz,
  -- Bloco de anotações do atendente. Nunca vai para o contato.
  add column notes text;

create index contacts_inbox_status_idx
  on public.contacts (inbox_status, last_message_at desc);

-- Respostas prontas: o que você digita toda hora vira atalho.
create table public.canned_replies (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  title       text not null,
  text        text not null,
  created_at  timestamptz not null default now()
);

create index canned_replies_account_idx on public.canned_replies (account_id, title);

alter table public.canned_replies enable row level security;

-- Mensagem nova do contato reabre a conversa: resolvida ou adiada não pode
-- esconder alguém que voltou a falar.
create or replace function public.touch_contact_on_message()
returns trigger
language plpgsql
as $$
begin
  if new.contact_id is null then
    return new;
  end if;

  update public.contacts
     set last_message_at = new.created_at,
         unread_count = case
           when new.direction = 'in' then unread_count + 1
           else unread_count
         end,
         inbox_status = case
           when new.direction = 'in' then 'open'
           else inbox_status
         end,
         snooze_until = case
           when new.direction = 'in' then null
           else snooze_until
         end
   where id = new.contact_id;

  return new;
end;
$$;
