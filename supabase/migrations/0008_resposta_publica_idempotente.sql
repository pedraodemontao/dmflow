-- dm-flow :: resposta pública idempotente
--
-- A resposta pública era enviada ANTES do fluxo começar. Quando o fluxo
-- falhava (ex.: janela de 24h fechada na segunda mensagem), o evento voltava
-- para a fila e o retry publicava o comentário DE NOVO.
--
-- Em 31/07 dois comentários viraram quatro respostas públicas, com 60s de
-- intervalo. Comentário repetido é exatamente o padrão que o filtro de spam
-- do Instagram pune.

alter table public.webhook_events
  add column public_reply_sent boolean not null default false;
