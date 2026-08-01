-- Insights de mídia — o que o vídeo fez, medido pela Meta.
--
-- POR QUE SNAPSHOT e não upsert por mídia: a pergunta que importa não é
-- "quantas views tem agora", é "quantas views tinha quando a automação foi
-- ligada". Sobrescrever apaga a única coisa que responde se a automação mudou
-- alguma coisa. Cada coleta grava uma linha nova; nada é atualizado no lugar.
--
-- POR QUE TUDO BIGINT e nenhum cálculo derivado aqui: mediana fracionária
-- gravada em bigint deixou um perfil inteiro sem métrica em 01/08 (migration
-- 0014, HANDOFF.md §4.9) — o Postgres recusou a linha e o erro foi parar num
-- array que ninguém lê. Retenção média, taxa de conversão e qualquer outra
-- divisão se calculam na leitura, nunca gravadas em coluna.
--
-- Vínculo mídia → automação é `triggers.media_id`, que já existe; esta tabela
-- não duplica esse relacionamento, só guarda o media_id solto para não
-- depender de um trigger sobreviver até a hora da leitura.
-- `if not exists` em tudo, como as outras: a migration é colada à mão no SQL
-- Editor e colar duas vezes é rotina — o dono não tem como saber o que já
-- rodou além de olhar o banco. Erro na segunda colagem parece falha da
-- migration e manda ele investigar o que estava certo.
create table if not exists public.media_insights (
  id                    bigserial primary key,
  account_id            uuid not null references public.accounts(id) on delete cascade,
  media_id              text not null,
  captured_at           timestamptz not null default now(),
  views                 bigint,
  reach                 bigint,
  follows               bigint,
  profile_visits        bigint,
  total_interactions    bigint,
  saved                 bigint,
  shares                bigint,
  link_clicks           bigint,
  avg_watch_time_ms     bigint,
  total_watch_time_ms   bigint,
  skip_rate             numeric
);

-- Consulta principal: histórico de uma mídia, mais recente primeiro.
create index if not exists media_insights_lookup
  on public.media_insights (account_id, media_id, captured_at desc);

alter table public.media_insights enable row level security;
