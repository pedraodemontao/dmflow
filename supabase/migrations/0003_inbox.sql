-- dm-flow :: inbox de chat ao vivo
-- Atendimento humano por cima da automação: thread por contato, envio manual,
-- e pausa da automação para quem está sendo atendido por gente.

alter table public.contacts
  -- Enquanto true, nenhum fluxo dispara nem retoma para este contato.
  -- Ligado sozinho quando um humano responde pelo inbox.
  add column automation_paused boolean not null default false,
  -- Denormalizados para o inbox ordenar e badgear sem varrer messages.
  add column last_message_at   timestamptz,
  add column unread_count      int not null default 0;

create index contacts_inbox_idx on public.contacts (last_message_at desc nulls last);

-- Quem escreveu: o fluxo ou uma pessoa pelo inbox.
alter table public.messages
  add column source text not null default 'flow'
    check (source in ('flow', 'manual'));

create index messages_thread_idx on public.messages (contact_id, created_at);

-- Mantém o resumo do inbox em dia a cada mensagem que entra ou sai.
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
         end
   where id = new.contact_id;

  return new;
end;
$$;

create trigger messages_touch_contact
  after insert on public.messages
  for each row execute function public.touch_contact_on_message();

-- Backfill: contatos que já têm histórico entram no inbox ordenados.
update public.contacts c
   set last_message_at = m.last_at
  from (
    select contact_id, max(created_at) as last_at
      from public.messages
     where contact_id is not null
     group by contact_id
  ) m
 where m.contact_id = c.id;
