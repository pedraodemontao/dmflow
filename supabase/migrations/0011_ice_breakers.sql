-- dm-flow :: ice breakers
-- Perguntas fixas que a Meta mostra quando alguém abre o direct com a conta
-- pela primeira vez (ROADMAP: "Ice breakers"). Configuração de CONTA — não é
-- nó de fluxo — publicada via POST /{ig-id}/messenger_profile
-- (setIceBreakers, src/lib/instagram/api.ts).
--
-- Ao tocar numa pergunta a Meta manda um messaging_postback com esse
-- payload, que cai no MESMO matcher de gatilho de palavra-chave que uma DM
-- digitada já usa (handleMessaging, src/lib/webhook/process.ts, já extrai
-- `postback.payload` como o texto do evento) — crie uma automação normal de
-- "palavra na DM" com match_mode = exact usando o mesmo payload como
-- palavra-chave.

alter table public.accounts
  -- Até 4 (limite da API). Cada item: { question: string, payload: string }.
  add column ice_breakers jsonb not null default '[]'::jsonb,
  -- Última publicação bem-sucedida na Meta — o painel usa para avisar quando
  -- o que está salvo no banco diverge do que está ao vivo na conta.
  add column ice_breakers_synced_at timestamptz;
