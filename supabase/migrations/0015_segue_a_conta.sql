-- "Só entrego o presente para quem segue."
--
-- A API do Instagram devolve isto de graça no perfil do contato, no campo
-- `is_user_follow_business` — confirmado contra a conta real em 01/08/2026.
-- Ele vem junto de `follower_count` e `profile_pic`, na mesma chamada que já
-- fazemos em `fetchContactProfile`: nenhuma requisição a mais.
--
-- POR QUE GUARDAR EM COLUNA e não perguntar na hora: a checagem acontece no
-- meio do fluxo, quando cada segundo é entrega esperando. Consultar a Meta ali
-- somaria latência a toda passagem pelo bloco, e uma indisponibilidade dela
-- viraria fluxo travado. O valor é atualizado quando a pessoa manda mensagem,
-- que é exatamente quando importa.
--
-- LIMITE HONESTO, e ele muda o desenho do fluxo: o perfil só é acessível
-- depois que o contato manda mensagem — comentar não dá consentimento (mesma
-- regra da foto de perfil, migration 0012). Então quem só comentou tem
-- `follows_account` NULO, e nulo aqui significa "ainda não dá para saber", não
-- "não segue". Tratar nulo como falso barraria gente que segue, e o bloco de
-- condição precisa distinguir os três estados.
alter table public.contacts
  add column if not exists follows_account boolean,
  add column if not exists follows_checked_at timestamptz;

comment on column public.contacts.follows_account is
  'Segue a conta? NULO = ainda não foi possível verificar (o contato só comentou, e comentário não dá consentimento de perfil). Nunca trate nulo como falso.';
