# ROADMAP — o que falta para ter o núcleo do ManyChat

> Comparação honesta com o ManyChat para Instagram. Marca o que já existe, o que falta e
> em que ordem vale construir. Atualizado em 2026-07-31 — a fase 8 ("Blocos restantes") saiu
> do papel: carrossel, vídeo/áudio/arquivo, pular para outro fluxo e sequência de bolhas
> foram implementados. Nada disso foi testado contra o Instagram de verdade ainda; passa no
> schema e nos testes, o que não é a mesma coisa que a Meta aceitar o payload.

Legenda: ✅ pronto · 🟡 parcial · ❌ não existe

---

## 1. Gatilhos (por onde uma pessoa entra no fluxo)

| Recurso | Estado | Nota |
|---|---|---|
| Comentário em post/reel com palavra-chave | ✅ | O coração da ferramenta, testado com dado real |
| Comentário em qualquer post | ✅ | `media_id` nulo no trigger |
| Palavra-chave em DM | ✅ | |
| Resposta padrão (nada casou) | ✅ | trigger `default` |
| Resposta a story | ✅ | Detecção (`reply_to.story`) coberta por teste em `process.test.ts`. Nenhum bug encontrado |
| Menção em story | 🟡 | Código pronto (`handleMessaging` detecta anexo `story_mention`), mas só dispara quando o webhook (nunca entregou nada, ver `HANDOFF.md`) ou o polling passarem a entregar o campo `attachments`. Não é `story_insights` — aquele campo é métrica do próprio story, engano corrigido nesta rodada |
| Ice breakers (perguntas fixas no início da conversa) | ✅ | Tela em `/ice-breakers`, publica via `POST /messenger_profile`. O toque cai no matcher de `keyword` já existente (payload = palavra-chave com `match_mode: exact`) |
| Link de referência (`ig.me/m/conta?ref=campanha`) | ❌ | **Bloqueado**: o `ref` só chega por webhook, e o webhook nunca entregou. O polling não expõe esse dado |
| Anúncio Click-to-Direct (`ad_id`) | ❌ | Mesmo bloqueio do `ref` |
| **Origem por conteúdo (de qual post veio o lead)** | ✅ | Funciona com polling: o id da mídia vem no evento de comentário |
| Comentário em live | 🟡 | Campo `live_comments` já é assinado, sem tratamento próprio |

## 2. Blocos do fluxo

| Bloco | Estado |
|---|---|
| Texto (com spintax e `{{nome}}`) | ✅ |
| Quick replies | ✅ |
| Botões (link e postback) | ✅ |
| Delay | ✅ |
| Condição (contém / igual / começa com / tem tag) | ✅ |
| Marcar e remover tag | ✅ |
| Chamar webhook externo | ✅ |
| Esperar resposta | ✅ |
| Imagem por link público | ✅ |
| Perguntar e validar (e-mail, telefone, número) | ✅ Repergunta e normaliza o valor |
| Gravar campo personalizado | ✅ Escreve em `contacts.fields` |
| Sorteio / teste A/B | ✅ 2 a 4 caminhos |
| Descadastrar o contato | ✅ `startFlow` respeita `subscribed` |
| Vídeo, áudio, arquivo | 🟡 Por URL pública, mesmo caminho da imagem. **Nunca testado contra o Instagram real** |
| Carrossel / galeria de cards | 🟡 **Nunca testado contra o Instagram real** |
| Pular para outro fluxo | ✅ `goto_flow`, escopado por `account_id`, com `MAX_STEPS` valendo na travessia |
| Sequência de bolhas (2 a 5 mensagens em ritmo humano) | ✅ Não existe no ManyChat. Cada bolha passa por spintax e cap próprios |
| **Avisar o admin** (DM, e-mail, webhook) | ❌ Dá para resolver com o bloco Webhook |

## 3. Contatos e público

| Recurso | Estado |
|---|---|
| Lista de contatos | ✅ Com busca por @usuário/nome |
| Tags | ✅ O fluxo marca e o painel edita |
| Campos personalizados | ✅ Bloco do fluxo grava, ficha edita |
| Filtro por etiqueta | ✅ |
| Ficha do contato (histórico, tags, campos, fluxos que rodou) | ✅ |
| Exportar CSV | ✅ Respeita os filtros da tela, inclui campos personalizados |
| Segmentos salvos | ❌ |

## 4. Chat ao vivo

| Recurso | Estado |
|---|---|
| Thread por contato, com histórico | ✅ |
| Responder na mão | ✅ Respeita janela de 24h e o cap de envios |
| Assumir conversa (pausa a automação do contato) | ✅ |
| Marcar como lida / contador de não lidas | ✅ |
| Respostas prontas (atalhos) | ✅ Inserem no rascunho, não enviam direto |
| Marcar como resolvida / adiar | ✅ Adiada vencida volta sozinha para abertas |
| Notas internas no contato | ✅ |
| Filtros (abertas, não lidas, adiadas, resolvidas) | ✅ Com contador por fila |
| Atribuir a um atendente | ❌ Só faz sentido com time |

## 5. Envio em massa — **cuidado aqui**

| Recurso | Estado |
|---|---|
| Broadcast para um segmento | ❌ |
| Sequência / régua de nutrição | ❌ |

É o recurso de maior valor comercial e o de **maior risco de banimento** — foi disparo
automático repetido que custou restrição em 2026-07-30 (ver `CLAUDE.md`).

Restrição real da plataforma: fora da janela de 24h o Instagram **não** deixa mandar DM comum.
Não existe "broadcast para todo mundo" como no e-mail. O que existe:

- Falar só com quem interagiu nas últimas 24h — público pequeno e sempre mudando.
- A tag `HUMAN_AGENT` estende para 7 dias, mas é para atendimento humano, não para campanha.

Ou seja: quando for construir, tem que ser broadcast **segmentado, com ritmo, respeitando
a janela e o cap**, não uma metralhadora. Recomendo deixar por último e construir com trava.

## 6. Métricas

| Recurso | Estado |
|---|---|
| Disparos e concluídos por automação | ✅ |
| Onde o fluxo perde gente (funil por bloco) | ✅ `/automacoes/[id]/metricas` |
| Taxa de conclusão | ✅ |
| Cliques por botão especificamente | ❌ O bloco de botões conta como um só |
| Gráfico ao longo do tempo | ❌ |

## 7. Operação

| Recurso | Estado |
|---|---|
| Pausar, duplicar e apagar automação | ✅ |
| Horário de silêncio | ✅ Adia para a abertura, não descarta o lead |
| Botão de pânico (travar tudo) | ✅ Sem desativar automação nenhuma |
| Múltiplas contas do Instagram | ❌ Schema já isola por `account_id`; falta o seletor |
| Time e permissões | ❌ Hoje é senha única no painel |

---

## Ordem sugerida

1. ~~**Blocos que faltam**~~ — ✅ feito: imagem, perguntar-e-validar, gravar campo, sorteio,
   descadastrar.
2. ~~**Contatos de verdade**~~ — ✅ feito: busca, filtro por etiqueta, ficha completa,
   campos personalizados.
3. ~~**Métricas por bloco**~~ — ✅ feito: funil por bloco e taxa de conclusão.
4. ~~**Origem por conteúdo**~~ — ✅ feito: ranking de posts que mais trazem lead, filtro de
   contatos por post e origem na ficha. Primeiro toque, só para quem chega comentando.
5. ~~**Segurança e última milha**~~ — ✅ feito: botão de pânico, horário de silêncio,
   exportação CSV.
6. ~~**Chat ao vivo turbinado**~~ — ✅ feito: respostas prontas, resolver/adiar, notas
   internas, filas com contador.
7. ~~**Gatilhos novos**~~ — ✅ feito: resposta de story testada, ice breakers publicáveis pelo
   painel, menção em story com código pronto (aguarda o webhook ou uma extensão do polling
   para disparar de verdade — ver nota da linha na tabela acima).
8. ~~**Blocos restantes**~~ — ✅ feito: carrossel, vídeo/áudio/arquivo, pular para outro fluxo e
   sequência de bolhas. Falta a prova real: nenhum deles passou por um envio de verdade.
9. **Múltiplas contas** — o schema já isola por `account_id`; falta o seletor no painel.
10. **Broadcast segmentado** — por último, com trava de janela, cap e confirmação.
    O Pedro decidiu não priorizar; era exemplo, não pedido.

### Dívida conhecida

- **Bloco novo nunca enviado de verdade.** Carrossel, vídeo, áudio e arquivo passam no schema
  e nos testes, mas ninguém confirmou que a Meta aceita o payload. Enquanto isso não for
  testado com um envio real, tratar como não pronto.
- **Foto de perfil expira.** `contacts.profile_pic_url` é URL assinada de horas/dias. O cache
  se revalida sozinho no próximo DM do contato (`PROFILE_REFRESH_MS` em
  `src/lib/webhook/process.ts`); entre uma revalidação e outra o cliente cai nas iniciais.
  Quem só comentou nunca tem foto — comentário não dá consentimento de perfil.

### Sobre o webhook

**Não é prioridade.** O polling entrega comentário e DM, e a blindagem anti-spam já adia
comentário em 30–120s de propósito — então o webhook não deixaria a resposta mais rápida
na prática. O que ele destrava é só atribuição de `ref` e de anúncio, que só importa quando
houver tráfego pago.

O que vale acompanhar: cada tick faz ~12 chamadas à API (1 de mídias + 10 de comentários +
1 de conversas), ou seja ~17 mil por dia. Com mais posts ou mais contas isso cresce e um dia
vira o motivo real para resolver o webhook — não a latência.
