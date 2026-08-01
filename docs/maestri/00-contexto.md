# CONTEXTO — leia antes de qualquer card

> Esta nota é o mínimo que todo agente precisa saber para não quebrar nada.
> Conecte-a a **todos** os recrutas. Os cards de feature (`01-`, `02-`, …) assumem que você leu.

## O que é este projeto

Automação de DM e comentário do Instagram, clone do núcleo do ManyChat. **Uso próprio,
single-tenant, em produção** em `https://dm.nocodepedro.site`. Uma conta do Instagram
(@nocodepedro), um usuário, uma senha de painel.

Alguém comenta uma palavra-chave num post → a conta responde no comentário → manda uma DM →
e a pessoa caminha por um fluxo montado num canvas visual.

Há também uma **biblioteca de conteúdo**: raspa perfis do nicho via Apify, mede o que performou
acima da mediana do próprio autor, e escreve roteiro novo modelado no vencedor.

## Leitura obrigatória, nesta ordem

1. `CLAUDE.md` — os invariantes. Cada um tem um incidente por trás.
2. `HANDOFF.md` — o que já quebrou de verdade, e o que nunca foi provado contra a API real.
3. `AGENTS.md` — **este Next.js não é o que você conhece.** Versão 16, Turbopack, o Middleware
   chama-se Proxy. Leia `node_modules/next/dist/docs/` antes de escrever código de framework.
4. `README.md` — variáveis de ambiente e como rodar.

## As cinco regras que não se negociam

**1. Não rode `npm run dev`.** O `.env.local` aponta para o banco de **PRODUÇÃO**. Subir o
servidor local mexe nos dados reais, e um tick manual dispara DM de verdade para gente de
verdade. Não existe staging. Para trabalho de código:

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

**2. Não aplique migration.** Não há CLI nem `psql` na máquina. Você **escreve** o arquivo em
`supabase/migrations/` e **avisa o dono**, que cola no SQL Editor do Supabase. Só depois disso
suba código que dependa da tabela. Migration aplicada é estado fora do repositório.

**3. Não toque em site da Meta com automação de navegador.** developers.facebook.com,
business.facebook.com, facebook.com, instagram.com — nenhum deles, com a sessão logada. Foi isso
que restringiu a conta em julho/2026. Precisa mexer lá? Escreva o passo a passo para o dono fazer
à mão. Chamada à Graph API por `curl` é aceitável, com parcimônia.

**4. Não enfraqueça a blindagem anti-spam.** Três camadas, todas invariantes: spintax `{a|b}` em
todo texto de envio, jitter no evento de comentário (8–35 s), e cap de envios por hora que
**falha fechado** (erro ao consultar = cap estourado). Resposta idêntica e instantânea em volume
é exatamente o que o filtro do Instagram derruba. Custou uma restrição de conta.

**5. Não commite `.env` nem segredo.** `.gitignore` bloqueia `.env*` e não há `.env.example`. A
lista real de variáveis é o schema Zod em `src/lib/env.ts`.

## Convenções

- Código, nomes de variável, rota e coluna: **inglês**. Texto visível ao usuário: **português**.
- Arquivos e pastas em `kebab-case`. Componente React exportado em `PascalCase`.
- Sufixos do Next: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`.
- `supabaseAdmin` e `env` são Proxies lazy. Não os transforme em constantes avaliadas no import,
  senão `next build` passa a exigir `.env`.
- Teste ao lado do código, `*.test.ts`, vitest. Bloco novo no fluxo → caso novo em `types.test.ts`.
- Comentário explica **por quê**, nunca **o quê**. Código bem nomeado já diz o quê.

## Como escrever mensagem de commit aqui

Conventional Commits, com o corpo explicando o **porquê** e, quando houver, o incidente que
motivou. As mensagens deste repositório são longas de propósito: são elas que sobrevivem quando
a memória de quem escreveu não sobrevive.

```
fix: arredonda a mediana, senão o perfil fica sem régua e sem outlier

Perfil com número par de vídeos produz mediana fracionária (12157.5). A
coluna `median_plays` é bigint, então o Postgres recusava — e o erro ia
parar num array que ninguém lê. Sem mediana o perfil não tem régua, e sem
régua NENHUM vídeo dele ganha multiplicador.
```

## Antes de dizer que terminou

Os quatro comandos verdes, e mais isto: **o que você entregou foi provado contra a API real, ou
só contra o schema?** Diga qual dos dois. "Passa no vitest" não é "a Meta aceitou o payload" — e
essa confusão já produziu features que nunca funcionaram e ninguém sabia.
