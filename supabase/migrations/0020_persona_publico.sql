-- Quem está do outro lado, e no que ele não acredita.
--
-- POR QUE ISTO É COLUNA E NÃO TEXTO NO CÓDIGO: `build-system-prompt.ts` diz, no
-- próprio cabeçalho, que frase que só serve a um nicho está no lugar errado — a
-- inteligência é DADO. O avatar do público é o dado mais específico de nicho que
-- existe. Cravar "Rafael, 31 anos, CLT" no prompt transformaria o gerador num
-- gerador de um creator só.
--
-- POR QUE DUAS COLUNAS E NÃO UMA: elas fazem trabalhos diferentes no prompt.
-- `audience` orienta VOCABULÁRIO e identificação — quem assiste, o que ele já
-- entende, o que precisa ser traduzido. `beliefs` é matéria-prima de GANCHO:
-- cada crença limitante é um Reel possível, e o gerador escolhe qual quebrar.
-- Misturadas num campo só, o modelo lê tudo como cenário e não usa nenhuma
-- como abertura.
--
-- ⚠️ `audience` DESCREVE QUEM ASSISTE, NUNCA O PASSADO DO CREATOR. A regra em
-- `FACT_RULES` existe porque converter isto em "eu também já fui assim" fabrica
-- uma biografia — e é a invenção mais perigosa, porque soa como a técnica de
-- copy certa e ninguém desconfia. Escreva sempre em terceira pessoa aqui.
--
-- `if not exists` em tudo, como as outras: a migration é colada à mão no SQL
-- Editor e colar duas vezes é rotina.

alter table public.personas
  add column if not exists audience text not null default '';

alter table public.personas
  add column if not exists beliefs text[] not null default '{}';

comment on column public.personas.audience is
  'Quem ASSISTE — idade, rotina, vocabulário que entende e o que precisa ser traduzido. Terceira pessoa, sempre: não é a biografia do creator.';

comment on column public.personas.beliefs is
  'Crenças limitantes do público. Banco de ganchos: quebrar uma é um Reel.';
