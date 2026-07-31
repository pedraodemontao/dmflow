# ROADMAP — o que falta para ter o núcleo do ManyChat

> Comparação honesta com o ManyChat para Instagram. Conferido linha a linha contra o código em
> 2026-07-31 (fim do dia). O que mudou nesta última rodada: cliques por botão saíram do "falta"
> para o "pronto", as métricas ganharam séries temporais em cinco lugares, a trava de variação
> ganhou interface própria e o construtor passou a apontar por onde o fluxo perde gente.
>
> Antes de confiar em qualquer ✅ desta página, leia a seção 5 do `HANDOFF.md`: passar no schema
> e no vitest não é a mesma coisa que a Meta aceitar o payload.

Legenda: ✅ pronto · 🟡 parcial · ❌ não existe

---

## 1. Gatilhos (por onde uma pessoa entra no fluxo)

| Recurso | Estado | Nota |
|---|---|---|
| Comentário em post/reel com palavra-chave | ✅ | O coração da ferramenta. Provado com lead real |
| Comentário em qualquer post | ✅ | `media_id` nulo no gatilho |
| **Resposta dentro da thread do comentário** | ✅ | Desde 31/07 o polling lê as respostas por expansão de campo (`replies`), no mesmo request do pai. Era o caso mais comum do produto e era invisível: o bot responde "te mandei no direct" e a pessoa responde ali dentro |
| Palavra-chave em DM | ✅ | |
| Resposta padrão (nada casou) | ✅ | Gatilho `default`. Vale para DM; comentário que não casa não cai nele |
| Resposta a story | ✅ | Caminho revisado e coberto por teste em `process.test.ts`. **Sem registro de disparo real** |
| Ice breakers | ✅ | Tela em `/ice-breakers`, publica via `POST /messenger_profile`. O toque cai no matcher de `keyword` (payload = palavra-chave com `match_mode: exact`). Sem confirmação de publicação aceita em produção |
| **Origem por conteúdo (de qual post veio o lead)** | ✅ | Funciona com polling: o id da mídia vem no evento. É primeiro toque — quem comenta em três reels fica atribuído ao que trouxe |
| Menção em story | 🟡 | `detectMessagingTriggerType` reconhece o anexo `story_mention`, o gatilho existe (migration 0010) e o matcher está pronto. Não dispara: o anexo só vem por webhook, e o polling de `/me/conversations` pede `id,created_time,from,message` — **não pede `attachments`**. Estender isso não foi feito por risco de quebrar o polling de DM, que sustenta a produção |
| Link de referência (`ig.me/m/conta?ref=campanha`) | ❌ | **Bloqueado pela plataforma**: `ref` só chega por webhook, e o webhook nunca entregou. O polling não expõe esse dado |
| Anúncio Click-to-Direct (`ad_id`) | ❌ | Mesmo bloqueio do `ref` |
| Comentário em live | ❌ | `live_comments` está na lista de campos que a conta assina, mas não há tratamento próprio nem varredura equivalente no polling. Enquanto o webhook não entregar, o campo assinado não vale nada |

## 2. Blocos do fluxo

| Bloco | Estado |
|---|---|
| Texto (spintax e `{{nome}}`) | ✅ Com campo de versões na interface — a sintaxe crua virou detalhe de armazenamento |
| Quick replies | ✅ Interpolam e passam por spintax como o resto (não passavam até 31/07) |
| Botões (link e postback) | ✅ Título e URL interpolam; `{{contact_id}}` liga o lead à página de captura |
| Delay | ✅ |
| Condição (contém / igual / começa com / tem etiqueta / existe) | ✅ |
| Marcar e remover etiqueta | ✅ |
| Chamar webhook externo | ✅ Checa o status: 4xx/5xx derrubam o nó em vez de gravar o corpo do erro em `saveAs` |
| Esperar resposta | ✅ |
| Perguntar e validar (e-mail, telefone, número) | ✅ Repergunta e normaliza o valor |
| Gravar campo personalizado | ✅ Escreve em `contacts.fields` |
| Sorteio / teste A/B | ✅ 2 a 4 caminhos |
| Descadastrar o contato | ✅ `startFlow` respeita `subscribed` |
| Imagem por link público | ✅ Nascida de comentário, espera a janela de 24 h abrir antes de mandar o anexo |
| Vídeo, áudio, arquivo | 🟡 Mesmo caminho da imagem. **Nunca enviados de verdade à Meta.** `audio` não aceita `mp3`, `file` só aceita `pdf` |
| Carrossel / galeria de cards | 🟡 **Nunca enviado de verdade.** E, mesmo que funcione, não aparece no Instagram Web |
| Pular para outro fluxo | 🟡 `goto_flow`, escopado por `account_id`, com `MAX_STEPS` valendo na travessia. Testes de engine dedicados, sem registro de disparo real |
| Sequência de bolhas (2 a 5 mensagens em ritmo humano) | 🟡 Não existe no ManyChat. Cada bolha passa por spintax e cap próprios. Sem registro de disparo real |
| **Avisar o admin** (DM, e-mail, webhook) | ❌ Dá para resolver com o bloco Webhook |

## 3. Contatos e público

| Recurso | Estado |
|---|---|
| Lista de contatos | ✅ Com busca por @usuário/nome, foto e selo de verificado |
| Etiquetas | ✅ O fluxo marca e o painel edita |
| Campos personalizados | ✅ Bloco do fluxo grava, ficha edita |
| Filtro por etiqueta e por post de origem | ✅ |
| Ficha do contato (histórico, etiquetas, campos, fluxos que rodou) | ✅ |
| Apagar contato e limpar dados de teste | ✅ A limpeza exige digitar APAGAR, e **não** zera `send_log` — ele é o livro-caixa do cap |
| Exportar CSV | ✅ Respeita os filtros da tela e prefixa `=+-@` com aspas, para o Excel não tratar "=cmd" como fórmula |
| Segmentos salvos | ❌ |

## 4. Chat ao vivo

| Recurso | Estado |
|---|---|
| Thread por contato, com histórico | ✅ |
| Responder na mão | ✅ Respeita a janela de 24 h e o cap de envios — atendimento humano não fura a blindagem |
| Assumir conversa (pausa a automação do contato) | ✅ `automation_paused` |
| Marcar como lida / contador de não lidas | ✅ |
| Respostas prontas (atalhos) | ✅ Inserem no rascunho, não enviam direto |
| Marcar como resolvida / adiar | ✅ Adiada vencida volta sozinha para abertas; mensagem nova reabre no próprio trigger do banco |
| Notas internas no contato | ✅ |
| Filtros (abertas, não lidas, adiadas, resolvidas) | ✅ Com contador por fila |
| Atribuir a um atendente | ❌ Só faz sentido com time |

## 5. Envio em massa — **cuidado aqui**

| Recurso | Estado |
|---|---|
| Broadcast para um segmento | ❌ |
| Sequência / régua de nutrição | ❌ |

É o recurso de maior valor comercial e o de **maior risco de banimento** — foi disparo
automático repetido que custou restrição de conta em 30/07/2026 (ver `HANDOFF.md`, seção 4.1).

Restrição real da plataforma: fora da janela de 24 h o Instagram **não** deixa mandar DM comum.
Não existe "broadcast para todo mundo" como no e-mail. O que existe:

- Falar só com quem interagiu nas últimas 24 h — público pequeno e sempre mudando.
- A tag `HUMAN_AGENT` estende para 7 dias, mas é para atendimento humano, não para campanha.

Quando for construir, tem que ser broadcast **segmentado, com ritmo, respeitando a janela e o
cap** — não uma metralhadora. Deixe por último e construa com trava.

## 6. Métricas

| Recurso | Estado |
|---|---|
| Disparos e concluídos por automação | ✅ |
| Onde o fluxo perde gente (funil por bloco) | ✅ `/automacoes/[id]/metricas`, reordenado pela caminhada a partir da entrada — a ordem por volume esconde a queda |
| Taxa de conclusão | ✅ |
| **Cliques por botão** | ✅ Agrupados por bloco e por payload (`button_clicks`, migration 0013). Botão com zero clique aparece — "ninguém escolheu esta opção" é o dado que muda a decisão. Payload ambíguo grava com origem nula em vez de chutar. **Confirme se a migration 0013 já foi aplicada no banco**: sem a tabela, a tela fica vazia sem erro |
| Gráfico ao longo do tempo | ✅ Leads por dia (30 d), envios por hora (24 h, com o cap tracejado), envios por tipo por dia, disparos por dia por automação, iniciados × concluídos por dia e leads por post no tempo (top 3) |
| **Onde o fluxo vaza, no construtor** | ✅ `src/lib/flow/leaks.ts`: bloco inalcançável, ponta solta, referência a bloco apagado e toda condição sobre texto livre, dizendo quais palavras ela procura. Não julga se o galho está certo — a tentativa de heurística deu falso positivo, e alerta falso ensina a ignorar alerta |
| **Monitor de risco de flag** | ✅ Não existe no ManyChat. Cinco sinais puros e testados (similaridade de texto, volume/hora, concentração em rajada, proporção de resposta pública, envio de madrugada), com piso de amostra para não gritar com 6 envios |

Duas leituras que a tela avisa e que vale repetir: a curva de iniciados × concluídos usa
`updated_at` (não existe `finished_at`), então as duas linhas **não são a mesma coorte** — leia
tendência, não razão dia a dia. E a contagem do funil é por pessoa, não por passagem: a
repergunta do `ask` não conta duas vezes.

## 7. Operação

| Recurso | Estado |
|---|---|
| Pausar, duplicar e apagar automação | ✅ A cópia nasce pausada |
| Horário de silêncio | ✅ Adia para a abertura com jitter, não descarta o lead |
| Botão de pânico (travar tudo) | ✅ Sem desativar automação nenhuma, então destravar devolve o estado exato |
| **Saída para o que travou** | ✅ Disparo falhado tem "tentar de novo" e "dispensar"; evento que esgotou as 12 tentativas vira card em "Precisa de ação" |
| **Saúde da conexão de verdade** | ✅ `checkAccountHealth` consulta a Meta e separa token inválido (fatal) de conta sem webhook (não fatal) e de Meta fora do ar |
| Múltiplas contas do Instagram | ❌ O schema já isola por `account_id`; falta o seletor. `getAccount()` pega a primeira conta ativa |
| Time e permissões | ❌ Hoje é senha única no painel |

---

## Ordem sugerida

1. ~~**Blocos que faltam**~~ — ✅ imagem, perguntar-e-validar, gravar campo, sorteio, descadastrar.
2. ~~**Contatos de verdade**~~ — ✅ busca, filtro por etiqueta, ficha completa, campos.
3. ~~**Métricas por bloco**~~ — ✅ funil por bloco e taxa de conclusão.
4. ~~**Origem por conteúdo**~~ — ✅ ranking de posts, filtro de contatos por post, origem na ficha.
5. ~~**Segurança e última milha**~~ — ✅ botão de pânico, horário de silêncio, exportação CSV.
6. ~~**Chat ao vivo turbinado**~~ — ✅ respostas prontas, resolver/adiar, notas, filas com contador.
7. ~~**Gatilhos novos**~~ — ✅ resposta de story testada, ice breakers publicáveis, menção em story
   com código pronto (aguarda o webhook ou uma extensão do polling).
8. ~~**Blocos restantes**~~ — ✅ carrossel, vídeo/áudio/arquivo, pular para outro fluxo e bolhas.
   Falta a prova real: nenhum deles passou por um envio de verdade.
9. ~~**Métricas de decisão**~~ — ✅ cliques por botão, séries temporais e análise de vazamento no
   construtor. É o que responde "o que escrever no próximo post" em vez de "quantos entraram".
10. **Provar os blocos novos.** Antes de qualquer feature nova: mandar carrossel, vídeo, áudio,
    arquivo, `goto_flow` e `bubbles` de verdade para a própria conta e olhar o direct. Custa uma
    tarde e converte seis 🟡 em ✅ ou revela seis bugs.
11. **Múltiplas contas** — o schema já isola por `account_id`; falta o seletor no painel.
12. **Broadcast segmentado** — por último, com trava de janela, cap e confirmação. O dono decidiu
    não priorizar; era exemplo, não pedido.

### Dívida conhecida

- **Bloco novo nunca enviado de verdade.** Carrossel, vídeo, áudio, arquivo, `goto_flow` e
  `bubbles` passam no schema e nos testes, mas ninguém confirmou que a Meta aceita o payload.
  Enquanto isso não for testado com um envio real, tratar como não pronto. O carrossel tem um
  agravante que não some com teste: **não aparece no Instagram Web**, então quem abre o direct
  pelo navegador não vê os cards.
- **Migration aplicada é estado fora do repositório.** Não há CLI do Supabase nem `psql` na
  máquina: cada arquivo é colado no SQL Editor à mão, e nada registra o que já rodou além do
  próprio banco. A 0013 (`button_clicks`) foi escrita como "ainda não aplicada" e não achei
  registro posterior. Código de métrica sobrevive à tabela ausente por desenho; o resto não.
- **Foto de perfil expira.** `contacts.profile_pic_url` é URL assinada de horas/dias. O cache se
  revalida sozinho no próximo DM do contato (`PROFILE_REFRESH_MS` em `webhook/process.ts`);
  entre uma revalidação e outra o cliente cai nas iniciais. Quem só comentou nunca tem foto —
  comentário não dá consentimento de perfil.
- **Um alarme que ninguém lê.** O 503 do tick só aparece no histórico do pg_cron, dentro do
  Supabase. Não há notificação: se ninguém abrir aquela tela, uma queda longa passa
  despercebida de novo. Foi assim que 30/07 durou 22 horas.

### Sobre o webhook

**Não é prioridade.** O polling entrega comentário e DM, e a blindagem anti-spam já adia
comentário de propósito — então o webhook não deixaria a resposta mais rápida na prática. O que
ele destrava é atribuição de `ref`, de anúncio e o anexo de menção em story, que só importam
quando houver tráfego pago.

O que vale acompanhar é o **custo da varredura**, e ele cresceu muito desde a captura total de
31/07: cada tick pagina até 8 páginas de mídia (200 posts) e, para cada post, até 20 páginas de
25 comentários, mais 8 páginas de conversas. Na prática quase toda paginação termina na primeira
página, mas o piso é da ordem de **uma chamada por post por minuto** — com 200 posts, algo como
200 mil chamadas por dia, contra a estimativa de ~17 mil que estava escrita aqui antes. É esse
número, e não a latência, que um dia vira o motivo real para resolver o webhook. Antes disso, o
ajuste barato é reduzir `MEDIA_PAGES` ou parar de varrer post antigo.
