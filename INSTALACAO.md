# Guia de instalação — do zero até a primeira DM automática

Este guia é para quem recebeu o repositório e vai montar **a própria instância** da ferramenta:
seu banco, seu app na Meta, sua conta do Instagram, seu domínio. Nada aqui é compartilhado com a
instância original — os dois sistemas não se falam.

> **Se você é o Claude Code lendo isto:** siga as etapas na ordem. Leia `CLAUDE.md` e `README.md`
> antes de mexer em código — as regras da seção "Invariantes" existem porque cada uma já derrubou
> a automação em produção. Nunca use automação de navegador em sites da Meta
> (facebook.com, developers.facebook.com, business.facebook.com, instagram.com): peça para a
> pessoa fazer esses passos à mão e guie clique a clique.

---

## 0. O que você vai precisar

| Item | Para quê | Custo |
|---|---|---|
| Node.js 22+ e Git | rodar e versionar o código | grátis |
| Conta no [GitHub](https://github.com) | guardar o seu repositório | grátis |
| Conta no [Supabase](https://supabase.com) | banco de dados, arquivos e agendador | grátis (pausa após 7 dias sem uso) |
| Conta na [Vercel](https://vercel.com) | hospedar o painel e as rotas da API | grátis (plano Hobby) |
| Conta de desenvolvedor na [Meta](https://developers.facebook.com) | app que fala com o Instagram | grátis |
| Conta do Instagram **profissional** (Business ou Creator) | a conta que vai responder | grátis |
| Domínio próprio (opcional, recomendado) | URL fixa para OAuth e links de entrega | ~R$ 40/ano |
| Chave da [Anthropic](https://console.anthropic.com) (opcional) | gerador de roteiro/legenda | por uso |
| Token da [Apify](https://apify.com) (opcional) | raspar perfis para a biblioteca | por uso |

Tempo estimado: 1h30 a 2h na primeira vez, a maior parte dentro do painel da Meta.

---

## 1. Traga o código para uma conta sua

Não trabalhe em cima do repositório de origem. Crie um repositório **seu** e **privado**:

```bash
git clone <URL-DO-REPOSITORIO-QUE-VOCE-RECEBEU> minha-ferramenta
cd minha-ferramenta
git remote remove origin
# crie um repositório vazio e privado no GitHub, depois:
git remote add origin https://github.com/<seu-usuario>/<seu-repo>.git
git push -u origin main
npm install
```

Confira que o código compila antes de configurar qualquer coisa:

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Os quatro precisam passar. Nenhum deles precisa de `.env`.

---

## 2. Tire a marca de origem do código

A ferramenta nasceu para uma pessoa específica e alguns textos e arquivos ainda carregam isso.
Nada disso quebra o funcionamento, mas você não quer mandar DM com o domínio de outra pessoa.

**Troque:**

- `src/app/(app)/page.tsx` — a mensagem de erro de OAuth cita o domínio de origem. Ponha o seu.
- `.github/workflows/canario.yml` — vigia uma URL da instância original. Troque pela URL de uma
  entrega sua depois da etapa 9, **ou apague o arquivo** até lá (senão ele falha de hora em hora
  e manda e-mail).
- `src/lib/render/palette.ts` — a paleta `QUANTIA` é a identidade visual de origem. Ajuste ou
  crie a sua pelo painel (Publicações → Marca).

**Apague (são material pessoal de quem criou, não fazem parte do produto):**

- `HANDOFF.md`, `ROADMAP.md`
- `docs/backups/`, `docs/personas/`, `docs/marca/`, `docs/maestri/`
- `scripts/criar-automacao-*.mts`, `scripts/criar-entrega*.mts`, `scripts/maestri-*.sh`
- As menções a contas, IDs de app e datas específicas em `CLAUDE.md` e `README.md` — reescreva as
  seções "Setup na Meta" do `CLAUDE.md` e a tabela de variáveis do `README.md` com os seus dados.

Os testes usam domínios e e-mails fictícios de exemplo; podem ficar.

---

## 3. Supabase: banco

1. Crie um projeto novo. Região `South America (São Paulo)` se o público é brasileiro.
2. Abra **SQL Editor** e rode **cada arquivo** de `supabase/migrations/`, **um por vez, na ordem
   numérica** (`0001_init.sql` até o último). Não pule nenhum, não junte dois.
3. Confira no fim:

   ```sql
   select count(*) from information_schema.tables where table_schema = 'public';
   ```

   Deve vir um número na casa das dezenas. Se algum arquivo deu erro, pare e resolva antes do
   próximo — as migrations dependem umas das outras.

4. Em **Project Settings → API**, copie a **Project URL** (`SUPABASE_URL`) e a chave
   **service_role** (`SUPABASE_SERVICE_ROLE_KEY`). A `service_role` ignora qualquer trava do
   banco: **nunca** ponha ela em código de navegador, print ou chat.

> RLS fica ligada em todas as tabelas e sem policy: só o servidor, com a `service_role`, lê e
> escreve. É o certo enquanto a ferramenta for de uma pessoa só.

---

## 4. Supabase: arquivos

Em **Storage**, crie três buckets, todos **públicos**:

| Bucket | Guarda |
|---|---|
| `delivery-files` | anexos das páginas de entrega |
| `library-thumbs` | capas copiadas dos posts da biblioteca |
| `publication-media` | imagens e vídeos que a ferramenta publica |

O nome tem que ser exatamente esse — está fixo no código.

---

## 5. App na Meta

Faça isto **à mão**, no navegador, logado na sua conta.

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Criar app** → tipo
   **Empresa** (Business).
2. Adicione o produto **Instagram** → **Configuração da API com login do Instagram**.
3. Em **Configurações do login da empresa**:
   - **URI de redirecionamento OAuth**: `https://SEU-DOMINIO/api/auth/instagram/callback`
     (você define o domínio na etapa 7; pode voltar aqui depois).
   - Permissões (as cinco — o login pede todas de uma vez): `instagram_business_basic`,
     `instagram_business_manage_messages`, `instagram_business_manage_comments`,
     `instagram_business_manage_insights`, `instagram_business_content_publish`. A lista
     oficial é `SCOPES` em `src/lib/instagram/oauth.ts`.
4. Copie o **ID do app do Instagram** e a **Chave secreta do app do Instagram**, que ficam **na
   própria tela do produto Instagram**.

   ⚠️ A Meta cria dois apps: o do Facebook e um do Instagram, cada um com ID e chave próprios. As
   credenciais de **Configurações → Básico** são do Facebook e **não funcionam** no login. Esse
   é o erro mais comum de toda a instalação.

5. Adicione sua conta como testadora: **Funções do app → Testadores do Instagram**. Depois, no
   app do Instagram: **Configurações → Apps e sites → Convites do testador → Aceitar**. Sem isso
   o login falha com "Função de desenvolvedor é insuficiente".
6. No Instagram, confirme que a conta é profissional e que **Configurações → Mensagens →
   Ferramentas de mensagens conectadas** está ativado.

---

## 6. Variáveis de ambiente

Gere segredos aleatórios com:

```bash
openssl rand -hex 32
```

| Variável | Obrigatória | Valor |
|---|---|---|
| `INSTAGRAM_APP_ID` | sim | ID do app do **Instagram** (etapa 5.4) |
| `INSTAGRAM_APP_SECRET` | sim | Chave secreta do app do **Instagram** |
| `INSTAGRAM_REDIRECT_URI` | sim | `https://SEU-DOMINIO/api/auth/instagram/callback` — idêntica à da Meta |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | sim | segredo aleatório |
| `SUPABASE_URL` | sim | etapa 3.4 |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | etapa 3.4 |
| `CRON_SECRET` | sim | segredo aleatório |
| `PANEL_PASSWORD` | na prática, sim | senha do painel, mín. 8 caracteres. **Sem ela o painel fica aberto para a internet** |
| `APP_URL` | recomendado | `https://SEU-DOMINIO`, sem barra no fim — monta os links de entrega |
| `DELIVERY_TOKEN_SECRET` | recomendado | segredo aleatório (mín. 16) — marca quem abriu cada entrega |
| `ANTHROPIC_API_KEY` | não | sem ela o gerador de roteiro usa texto de exemplo |
| `ANTHROPIC_MODEL` | não | modelo do gerador |
| `APIFY_TOKEN` | não | sem ele, só o botão de raspar perfil fica desligado |
| `META_APP_SECRET` | não | chave do app do **Facebook**; só serve para o webhook |
| `CONVERSION_SECRET` | não | protege `POST /api/conversao` |
| `SEND_HOURLY_CAP` | não | padrão 60 envios/hora |
| `PUBLIC_REPLY_PER_POST_CAP` | não | padrão 8 respostas públicas/hora no mesmo post |
| `PUBLISH_DAILY_CAP` | não | padrão 3 publicações/dia |

A lista oficial é o schema em `src/lib/env.ts`. Para rodar local, crie `.env.local` na raiz com
essas chaves. **Esse arquivo nunca vai para o Git** (o `.gitignore` já bloqueia).

---

## 7. Deploy na Vercel

```bash
npm i -g vercel
vercel login
vercel link          # cria o projeto na sua conta
vercel env add ...   # ou cole tudo em Project Settings → Environment Variables
vercel deploy --prod
```

Depois:

1. Em **Settings → Domains**, ligue seu domínio (ou use o `*.vercel.app` que a Vercel dá).
2. Ajuste `INSTAGRAM_REDIRECT_URI` e `APP_URL` para esse domínio, na Vercel **e** na Meta
   (etapa 5.3), e faça `vercel deploy --prod` de novo.

> O projeto não tem deploy automático por `git push` a menos que você conecte o GitHub na
> Vercel. Sem essa conexão, **todo deploy é pelo comando acima** — commit que não foi deployado
> não está no ar.

---

## 8. Agendador: o coração da automação

A ferramenta **não depende do webhook da Meta**: ela varre comentários e mensagens a cada
minuto. Quem dispara essa varredura é o `pg_cron` do Supabase. Sem esta etapa, nada acontece —
e nenhum erro aparece.

No **SQL Editor** do Supabase:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'dmflow-tick',
  '* * * * *',
  $$
    select net.http_get(
      url := 'https://SEU-DOMINIO/api/cron/tick?secret=SEU_CRON_SECRET',
      timeout_milliseconds := 300000
    );
  $$
);
```

Conferir se está rodando (espere dois minutos):

```sql
select status, start_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'dmflow-tick')
order by start_time desc limit 5;

select status_code, left(content::text, 200) from net._http_response
order by created desc limit 5;
```

`status_code` 200 = varreu. 503 = varredura falhou (veja o corpo da resposta). 401 = segredo
errado na URL.

> O `vercel.json` também agenda o tick uma vez por dia. É só rede de segurança — o plano grátis
> da Vercel não permite cron de minuto.

---

## 9. Conectar o Instagram e testar

1. Abra `https://SEU-DOMINIO` (**sempre pelo domínio público, nunca por `localhost`** — o login
   guarda um cookie que não sobrevive à troca de endereço e falha com `state-invalido`).
2. Entre com a `PANEL_PASSWORD`.
3. Clique em **Conectar Instagram** e autorize.
4. Crie uma automação pelo painel: gatilho por palavra num comentário, resposta com variações.
   O painel **recusa ativar** automação sem variações suficientes (pelo menos 3 na resposta
   pública e 2 no texto do fluxo) — é proposital, veja a seção 10.
5. De **outra** conta do Instagram, comente a palavra num post seu. Em até ~1 minuto (mais um
   atraso aleatório de 8 a 35 segundos) chega a resposta pública e a DM.

Existe um fluxo de exemplo em `supabase/seed.sql`. Ele entra **já ativo e sem variações**:
se usar, abra no painel e salve com as variações preenchidas antes de receber tráfego real.

---

## 10. Regras que protegem a sua conta

O Instagram restringe conta que responde **rápido, igual e em volume**. A instância original já
foi restringida por isso. A ferramenta tem três travas contra — **não desligue nenhuma**:

- **Variações de texto** com a sintaxe `{Oi|Olá|E aí}`: cada envio sorteia uma.
- **Atraso aleatório** antes de responder comentário.
- **Teto de envios por hora** (`SEND_HOURLY_CAP`). Estourou, o fluxo espera e retenta sozinho.

Mais três coisas que derrubam a automação em silêncio:

- **Trocar a senha do Facebook invalida o token do Instagram.** Mexeu em senha ou segurança da
  conta, reconecte pelo painel.
- **Supabase grátis pausa após 7 dias sem uso.** O painel fica em branco, sem erro. Reative em
  supabase.com.
- **Não use extensão ou robô de navegador logado em site da Meta.** É lido como comportamento
  automatizado e rende restrição.

---

## 11. Desenvolver a partir daqui

- **Não existe ambiente de teste.** O `.env.local` aponta para o seu banco de verdade: `npm run
  dev` mexe nos dados reais, e chamar o tick à mão manda DM de verdade. Para trabalhar em código,
  prefira:

  ```bash
  npx tsc --noEmit && npm run lint && npm test
  ```

- Antes de dizer que terminou qualquer mudança: `npx tsc --noEmit && npm run lint && npm test &&
  npm run build`. O CI do GitHub roda os mesmos quatro.
- Migration nova: crie o arquivo seguinte em `supabase/migrations/`, cole no SQL Editor **antes**
  de subir o código que depende dela.
- Mapa do código e as regras invioláveis: `CLAUDE.md`. Como a ferramenta funciona e os limites
  da Meta: `README.md`.

---

## Quando algo não funciona

| Sintoma | Primeira coisa a olhar |
|---|---|
| Login com Instagram: "Função de desenvolvedor é insuficiente" | etapa 5.5 — convite de testador não aceito |
| Login: `state-invalido` | começou em `localhost` ou num domínio diferente do `INSTAGRAM_REDIRECT_URI` |
| Login: "Invalid platform app" | usou o ID/chave do app do Facebook, não do Instagram (etapa 5.4) |
| Comentário não recebe resposta | o job do pg_cron existe e responde 200? (etapa 8) · a automação está ativa? · a palavra está presa a um post específico? |
| Painel em branco | projeto do Supabase pausado |
| Tudo parou de repente | token do Instagram caiu — reconecte pelo painel |
| `npm run build` pede variável | alguém transformou `env` em constante; ele precisa continuar lazy (`src/lib/env.ts`) |
