# CARD 05 — O carrossel nasce do roteiro, renderizado e pronto para publicar

> Pré-requisito: leia `00-contexto.md` e o `04-publicar.md` (a tabela `publications` dele é o
> destino de tudo que este card produz).
> **Fases 1 e 2 são puras e correm em paralelo com o card 04.** A fase 3 espera a fase 4 do
> card 04 fechar no quadro — é ela que expõe `createPublication`.
> Tamanho: 3 fases, cada uma entregável sozinha.

## O problema real

A biblioteca mede o que viraliza no nicho, escreve o roteiro e agora a entrega — e tudo isso
**para em texto**. Do `scripts.output` para um post no ar há um caminho manual inteiro: montar
slide, escolher fonte, exportar, subir, colar legenda.

O dono pediu a função que o Bravy Publisher tinha: **tema → carrossel → post, sem passar por
editor.** A decisão de 29/08 (ver o card 04) foi não portar o Publisher, e sim construir esse
caminho com o que já existe aqui. O que o Publisher fazia com 4 mil linhas de engine
determinística (`fontkit` + `skia-canvas`) e um estúdio Konva, nós fazemos com o render de
imagem que o Next já traz — porque **não temos editor arrastável**, e é o editor que exigia
render idêntico no browser e no servidor. Sem editor, o servidor é a única fonte da imagem.

## O que construir

```
persona + pilar + tema  ─┐
item da biblioteca (molde) ├→ generateCarousel (Anthropic, schema Zod) → slides em TEXTO
roteiro já gerado        ─┘            │
                                       ▼
                     renderSlides (next/og → PNG → sharp → JPEG 1080×1350)
                                       │
                                       ▼ bucket publication-media
                     createPublication({ kind: 'carousel', media_paths, caption, script_id })
                                       │
                                       ▼
                              o card 04 agenda e publica
```

O modelo escolhe **o que** dizer em cada slide; **como** fica na tela é nosso. Mesma regra da
entrega (`01-entrega.md`): o modelo nunca devolve HTML.

---

## Fase 1 — Schema e geração (`src/lib/ai/`)

**Schema** — `carouselSchema` em `src/lib/ai/schemas.ts`, ao lado de `scriptSchema`:

- `slides`: array de 3 a 10 de `{ kind: 'cover' | 'body' | 'cta', title, body? }`.
  Primeiro é `cover`, último é `cta`, meio é `body`. Valide a ordem com `.refine`.
- `title` ≤ 60 caracteres, `body` ≤ 220. **Os limites são de RENDER, não de gosto.** O satori
  não tem *shrink-to-fit* (o engine do Publisher tinha, e era metade do código dele). Fonte fixa
  + teto de caracteres é o que garante que o texto cabe. Meça os tetos com o preview da fase 2 e
  ajuste aqui — o schema é a primeira cerca, e a única.
- `caption`: legenda do post, ≤ 2.200 (limite da Meta), com hashtags. Sem spintax: legenda de
  post é uma só, não é envio repetido.
- Texto **puro**. Nada de markdown, `<em>`, emoji como bullet.

**Migration** — `supabase/migrations/0022_roteiro_tem_tipo.sql`. **Não aplique.**

```sql
alter table public.scripts
  add column if not exists kind text not null default 'reel'
  check (kind in ('reel', 'carousel'));
```

O carrossel gerado é gravado em `scripts` (`output`, `model_used`, `tokens_in/out`) como o
roteiro — é a mesma peça de IA, só a forma muda, e `publications.script_id` já aponta para lá.
Tabela nova seria uma segunda `scripts` com outro nome.

**Geração** — `src/lib/ai/generate-carousel.ts`, espelhando `generate.ts`:

- `generateCarousel(input)` com **mock determinístico** quando não há chave, e mock no `catch` —
  a regra e o motivo estão no cabeçalho de `generate.ts`.
- Três entradas: `(a)` pilar + tema + `refs` da biblioteca, `(b)` `modeledOn` (um item que
  viralizou — o mesmo botão que gera roteiro modelado), `(c)` `fromScript: Script` — um roteiro
  que já existe vira carrossel: **mesma ideia, lida em vez de falada.** Nesse caso o prompt
  recebe headline, beats e a legenda do roteiro, e a instrução é manter a promessa e a
  palavra-chave do CTA.
- System prompt: `buildSystemPrompt(persona)` **como está** — voz, regras de fato e mecanismos
  nomeados são compartilhados. O que muda é o user prompt: um slide = uma ideia; capa = **um** gancho (não as
  três variações de `HOOK_VARIANTS` — carrossel não tem teste A/B de gancho); último = CTA com `buildCtaBlock(persona)`, pedindo o
  comentário com `persona.cta_keyword`.
- `MODEL_BY_TASK.carousel` e `MAX_TOKENS_BY_TASK.carousel` em `anthropic.ts`. Aplique o critério
  escrito no cabeçalho do arquivo (criativo × estruturado) e **escreva o raciocínio no
  comentário**, como os dois existentes. Não copie o modelo do roteiro por reflexo.
- Grave em `scripts` com `kind = 'carousel'`; devolva o resultado **mesmo se falhar ao gravar**
  (o dono já pagou a geração — `01-entrega.md`, fase 2).

**Testes:** schema (ordem dos slides, tetos, caption), mock determinístico, prompt contém a
palavra-chave do CTA, caminho `fromScript` preserva a headline.

## Fase 2 — Render (`src/lib/render/`)

- **`slide-element.tsx`** — função **pura**: `(slide, index, total, brand) → ReactElement` com
  estilos inline. É o que os testes cobrem: satori não roda bem em vitest, e o que importa
  testar é a decisão (capa mostra @handle e não paginação; body mostra `n/N`; cta mostra a
  palavra-chave).
- **`render-slide.ts`** — `renderSlide(element): Promise<Buffer>`: `new ImageResponse(element,
  { width: 1080, height: 1350, fonts })` de `next/og` → `arrayBuffer()` → `sharp().jpeg({
  quality: 90 })`. Referência: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md`.
  **Runtime Node**, nunca `runtime = 'edge'`. Só flexbox — `grid` não existe no satori.
- **1080×1350 (4:5).** É a proporção máxima de altura do feed; ocupa mais tela que 1:1 e a Meta
  aceita. O card 04 recusa o que sai de 4:5–1.91:1 na entrada; aqui já nasce certo.
- **Fontes em TTF dentro do repositório** (`src/lib/render/fonts/`), lidas com `fs.readFile` uma
  vez por processo — **não** `import`, para não entrar no bundle; **não** Google Fonts em
  runtime (latência a cada render, e um CDN a mais para cair). Tipografia e paleta vêm de
  `docs/marca/quantia-manual.md` (seção "Tipografia", linha ~162; paleta a partir da ~118). Se
  a fonte do manual não for de licença livre para embutir, use a alternativa livre mais próxima
  e **diga no relatório** — não silencie a troca.
- **Upload** — `src/lib/render/upload-slides.ts`: `supabaseAdmin.storage.from('publication-media')
  .upload(path, buffer, { contentType: 'image/jpeg', upsert: true })`. Caminho:
  `carousel/{scriptId}/{version}/{n}.jpg`. **`version` existe por causa de cache:** a URL
  pública do Supabase passa por CDN; regerar no mesmo caminho pode servir à Meta a imagem velha
  por até uma hora. Caminho novo a cada render, sempre.
- **`scripts/render-preview.mts`** — fora do app, como os outros de `scripts/`: renderiza os
  três tipos de slide com os textos **mais longos que o schema permite** para uma pasta local
  (`out/`, no `.gitignore`). É a prova visual da fase; o dono olha as imagens. Sem servidor, sem
  banco.

**Testes:** `slide-element` (as três decisões acima), `upload-slides` (caminho com versão,
`contentType` correto, erro do storage **sobe** — não vai para array).

## Fase 3 — A tela (`/publicacoes/gerar`) — espera a fase 4 do card 04

Só comece quando o quadro disser `card 04 fase 4 — FECHADA` e a branch estiver na `main`.
Enquanto isso, fases 1 e 2 e o preview são trabalho de sobra.

- `src/app/(app)/publicacoes/gerar/page.tsx` + `actions.ts` **próprios**. A pasta
  `publicacoes/` é do card 04; **você é dono só de `gerar/`**. Precisou tocar em
  `publicacoes/page.tsx` ou `publicacoes/actions.ts`: `⚠️ PEDIDO` no quadro, não edite.
- Fluxo: fonte (pilar + tema | item da biblioteca | roteiro existente) → gerar → preview dos
  slides (`<img>` das URLs públicas) → editar o texto de cada slide → re-render → legenda →
  automação de comentário (o seletor do card 04, fase 5) → **"Salvar como rascunho"** →
  `createPublication` importada de `../actions.ts` → redirect para `/publicacoes`.
- Pontos de entrada: um link "Gerar carrossel" no card do item da biblioteca (ao lado de
  "Gerar roteiro") e um "Virar carrossel" na tela do roteiro
  (`src/app/(app)/biblioteca/roteiros/page.tsx`). Um link em cada; declare os dois arquivos no
  quadro antes de tocar.
- **Publicar não é daqui.** A tela termina em rascunho; agendar e publicar é a lista do card 04.

---

## Definição de pronto

- [ ] `npx tsc --noEmit && npm run lint && npm test && npm run build` — quatro verdes
- [ ] Testes novos: schema do carrossel, mock, prompt, `slide-element`, `upload-slides`
- [ ] `scripts/render-preview.mts` gerou os três slides com os textos mais longos permitidos e
      **o dono olhou as imagens** — cabe, sem corte, legível no celular
- [ ] Migration 0022 **escrita** e o dono **avisado**
- [ ] **Provado contra a API real:** um carrossel gerado aqui → rascunho em `publications` →
      publicado pelo card 04 na conta

## O que NÃO fazer

- Não instale AI SDK. Não instale `skia-canvas`, `canvas`, `playwright`, `puppeteer` — binário
  nativo que o Publisher precisava por causa do editor; nós não temos editor.
- Não busque fonte do Google em runtime. Não `import` de TTF.
- Não deixe o modelo devolver HTML ou markdown nos slides.
- Não use `runtime = 'edge'`.
- Não chame a Meta. Publicar é o card 04.
- Não grave URL; caminho.
- Não regere no mesmo caminho do bucket.
- Não toque nos arquivos do card 04 sem `⚠️ PEDIDO`.
- Não aplique migration, não faça deploy, não rode `npm run dev`.
