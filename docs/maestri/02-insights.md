# CARD 02 — Insights do vídeo que gerou a automação

> Pré-requisito: leia `00-contexto.md`.
> **A fase 0 é do dono e bloqueia todo o resto.** Não comece a fase 2 antes dela.

## O problema real

O painel mede o que **nós** fizemos: DM enviada, bloco visitado, botão clicado. Não mede o que
aconteceu **com o vídeo**. Então a pergunta que o dono faz depois de todo post — *"valeu a pena
gravar isso?"* — não tem resposta aqui, e ele vai olhar no app do Instagram, onde os dois lados
não se cruzam.

O dado que falta é justamente o do meio: quantas pessoas viram, quantas comentaram, quantas
viraram conversa, e **quantas seguiram por causa daquele vídeo**.

## O que a API entrega, e o que não entrega

Medido por `curl` contra a conta real em 01/08 — não é suposição, e vale mais que qualquer
documentação:

**Entrega (por mídia):** `views`, `reach`, `follows`, `profile_visits`, `total_interactions`,
`saved`, `shares`, `link_clicks`, `navigation`, `ig_reels_avg_watch_time`,
`ig_reels_video_view_total_time`, `reels_skip_rate`.

**`follows` é literalmente "quantos seguidores este vídeo trouxe".** É a métrica que o dono
pediu, e ela existe.

**Entrega (por conta, série diária):** `follower_count`, `follows_and_unfollows`, `reach`,
`profile_views`, `profile_links_taps`, `accounts_engaged`, `views`.

**NÃO entrega: a curva de retenção segundo a segundo.** Ela é exclusiva do app do Instagram, não
existe em API nenhuma da Meta. Portanto **não construa** nenhuma tela que prometa "o segundo em
que a pessoa saiu" ou "a parte que mais converteu na retenção" — não há como preencher.

O mais próximo honesto, com o que existe:

- `ig_reels_avg_watch_time` — quantos segundos, em média, a pessoa assistiu
- `ig_reels_video_view_total_time` — tempo total somado
- `reels_skip_rate` — taxa de pulo
- e a divisão `avg_watch_time ÷ duração do vídeo` = **retenção média**, comparável entre posts

Rotule cada uma pelo que ela é. Chamar retenção média de "curva de retenção" é a mentira que faz
alguém tomar decisão errada seis meses depois.

**A compensação vale mais que a curva:** nós temos o funil que o Instagram **não** tem — quem
comentou, quem virou DM, quem clicou no botão, quem seguiu, quem abriu o presente. O Instagram
sabe quantos viram; só nós sabemos quantos viraram conversa. É esse cruzamento a feature.

---

## Fase 0 — DO DONO, e bloqueia o resto

Todas as métricas de mídia hoje respondem `Application does not have permission for this action`.
Não é bug: falta o escopo. `SCOPES` em `src/lib/instagram/oauth.ts` pede três, e o que falta é
**`instagram_business_manage_insights`**.

O agente faz a parte 1. O dono faz as partes 2 e 3 — **nenhum agente encosta em site da Meta**
(regra 3 do contexto; automação de navegador logada lá custou uma restrição de conta em julho).

1. **(agente)** Somar `'instagram_business_manage_insights'` ao array `SCOPES`. Uma linha.
   Deploy.
2. **(dono)** Em developers.facebook.com → app **`dm-flow-IG`** (ID `2815946815447454`, **não** o
   Facebook App) → Instagram → Configuração da API com login do Instagram → conferir que a
   permissão de insights está na lista de permissões do app.
3. **(dono)** Abrir `https://dm.nocodepedro.site` → painel → **reconectar o Instagram**. O token
   atual foi emitido com três escopos e continuará sem insights para sempre; só um consentimento
   novo traz o quarto.

**Como saber se funcionou** (o dono roda, ou o agente com o token já novo):

```bash
curl "https://graph.instagram.com/v23.0/<MEDIA_ID>/insights?metric=views,follows,reach&access_token=<TOKEN>"
```

Voltou número: pode seguir. Voltou `Application does not have permission`: a reconexão não pegou
o escopo, e **nada da fase 2 em diante vai funcionar** — pare e resolva isto primeiro.

## Fase 1 — Schema

`supabase/migrations/0017_insights_de_midia.sql`. Escreva, **não aplique**, avise o dono.

```sql
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

create index if not exists media_insights_lookup
  on public.media_insights (account_id, media_id, captured_at desc);
```

**Por que snapshots em vez de uma linha por mídia atualizada no lugar:** a pergunta que importa
não é "quantas views tem", é "**quantas views tinha quando eu liguei a automação**". Sobrescrever
apaga a única coisa que responde se a automação mudou alguma coisa. Linha nova a cada coleta.

**Todos os contadores são `bigint`, e nenhum cálculo derivado entra nesta tabela.** Foi mediana
fracionária gravada em `bigint` que deixou um perfil inteiro sem métrica em 01/08 (`HANDOFF.md`
§4.9). Divisão (retenção média, taxa de conversão) se faz na leitura, em `numeric` ou em JS.

## Fase 2 — Coletar

No tick (`/api/cron/tick`), depois do que já existe.

- Quais mídias: as que têm automação ligada. **`triggers.media_id` já existe** e é o vínculo
  post ↔ automação — não invente outro.
- Ritmo: **uma coleta por mídia por hora**, no máximo. Insight não muda de minuto em minuto, e
  chamada de API é orçamento que a entrega precisa mais que a métrica.
- **A coleta não pode derrubar o tick.** Envolva em try/catch próprio, erro para `console.error`.
  O tick responde 503 quando o *polling* falha, porque é o único aviso de que a automação parou —
  métrica falhando não é isso, e transformá-la em 503 treinaria o dono a ignorar o alarme que
  importa.
- Métrica em lote numa chamada (`metric=views,reach,follows,…`), não uma por vez.
- Post antigo para de mudar: se duas coletas seguidas vierem iguais e o post tem mais de 30 dias,
  espace para uma vez por dia.

## Fase 3 — A tela

Em `/automacoes/[id]/metricas`, ou aba nova ao lado. Três blocos, nesta ordem:

**1. O que o vídeo fez** (dado da Meta)
`views` · `reach` · **`follows` — seguidores que este vídeo trouxe** · `profile_visits` ·
retenção média (`avg_watch_time ÷ duração`, rotulada como média) · `saved` · `shares`

**2. O que a automação fez com isso** (dado nosso — o diferencial)

```
viram             ████████████████████  12.400   (views)
comentaram           ██                    310   (webhook_events daquela mídia)
viraram DM           ██                    298   (flow_runs)
clicaram             █                      94   (button_clicks)
seguiram             █                      71   (contacts.follows_account, na janela do post)
abriram o presente   █                      63   (delivery_views — depende do card 01)
```

Cada degrau com a **queda em %** em relação ao anterior. O degrau que mais perde é a resposta
para "o que consertar" — e é a versão honesta do que foi pedido como "a parte que mais converteu".

**3. Comparativo entre posts**
Ranking dos vídeos com automação, ordenável por seguidores trazidos, por conversão
comentário→DM, e por conversão view→seguidor. É aqui que a decisão de conteúdo acontece: *este
formato converte, aquele não*.

Use os primitivos que já existem em `src/components/ui/chart.tsx` (`BigNumber`, `Meter`,
`RankBars`, `TimeSeries`, `LineSeries`). Não introduza biblioteca de gráfico.

**Quando não há dado, diga por quê.** "Sem insights — reconecte o Instagram para liberar as
métricas" é útil; um zero é indistinguível de um vídeo que ninguém viu.

---

## Definição de pronto

- [ ] Quatro verdes
- [ ] Testes: parse da resposta de insights (incluindo métrica ausente, que a Meta omite em vez
      de mandar zero), o cálculo do funil, o espaçamento da coleta
- [ ] Migration escrita, dono avisado, não aplicada por você
- [ ] Um post real com números na tela, conferidos contra o app do Instagram
- [ ] Nenhuma tela promete curva de retenção

## O que NÃO fazer

- Não prometa retenção segundo a segundo.
- Não faça a métrica derrubar o tick.
- Não colete de minuto em minuto.
- Não guarde valor derivado em coluna `bigint`.
- Não abra site da Meta com automação de navegador.
