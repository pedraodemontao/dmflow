-- dm-flow :: foto e perfil do contato
--
-- Dono quer ver foto e @ nas telas de Contatos e Conversas. A Graph API
-- devolve isso em GET /{ig-user-id}?fields=name,username,profile_pic,
-- follower_count,is_verified_user — mas só para quem já mandou DM (comentário
-- sozinho não dá consentimento; a API responde "User consent is required to
-- access user profile" e fetchContactProfile trata isso como perfil
-- indisponível, não como erro). A maioria dos contatos vem só de comentário,
-- então a maioria continua sem foto — o avatar cai para as iniciais do @.
--
-- profile_pic_url é uma URL ASSINADA QUE EXPIRA em horas/dias. Guardar e
-- exibir direto sem plano de revalidação dá imagem quebrada depois de um
-- tempo. Duas camadas cobrem isso, nenhuma sozinha:
--   1. profile_synced_at marca quando foi buscado. upsertContact
--      (src/lib/webhook/process.ts) revalida oportunisticamente: toda vez
--      que o contato manda DM de novo (o único evento com consentimento) E
--      o cache passou de 24h, busca de novo — sem precisar de cron dedicado,
--      porque é exatamente quando a foto seria vista de novo no inbox.
--   2. Mesmo com isso, a URL pode expirar entre uma revalidação e outra (ou
--      o contato nunca mais escrever). O componente Avatar
--      (src/components/ui/index.tsx) trata erro de carregamento no cliente
--      caindo para as iniciais — rede de segurança que não depende de nada
--      ter rodado no servidor a tempo.

alter table public.contacts
  add column profile_pic_url   text,
  add column follower_count    integer,
  add column is_verified       boolean not null default false,
  add column profile_synced_at timestamptz;
