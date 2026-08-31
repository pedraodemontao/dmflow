-- A marca sai do código.
--
-- A paleta dos slides vivia hardcoded em `slide-element.tsx` ("QUANTIA,
-- não é por persona") — o que estava certo para UMA conta e errado para o
-- produto: a instância da Beca renderizaria slides com a marca do Pedro, e
-- trocar cor exigiria deploy. Uma coluna jsonb na própria conta, porque a
-- marca é da conta: single-tenant aqui, e cada instância tem a sua.
--
-- jsonb e não colunas soltas: o shape é do código (`paletteSchema` em
-- src/lib/render/palette.ts), que valida e completa com o padrão QUANTIA o
-- que faltar. Campo desconhecido é ignorado, campo ausente cai no padrão —
-- a coluna nunca quebra um render.
--
-- `if not exists` como as outras: a migration é colada à mão no SQL Editor
-- e colar duas vezes é rotina. E o código que lê a coluna cai no padrão
-- QUANTIA se ela ainda não existir: tela nova nunca espera migration.
alter table public.accounts
  add column if not exists brand jsonb not null default '{}'::jsonb;

comment on column public.accounts.brand is
  'Paleta e rótulos dos slides gerados (paletteSchema). Vazio = padrão QUANTIA.';
