# Fontes do render — proveniência e licença

Três TTF, um por papel semântico do manual de marca
(`docs/marca/quantia-manual.md`, seção 05 — Tipografia: "proporcional para o
que a marca diz, monoespaçado para o que a marca mediu"):

| Arquivo | Papel no slide | Família · estilo real | Peso/largura pedidos pelo manual |
|---|---|---|---|
| `archivo-semiexpanded-bold.ttf` | Título (capa/body/cta) | Archivo SemiExpanded Bold | wght 600–700 · wdth 105–112 |
| `ibm-plex-sans-regular.ttf` | Corpo do slide | IBM Plex Sans Regular | wght 400–600 |
| `ibm-plex-mono-medium.ttf` | Rótulo (@handle, n/N, palavra-chave) | IBM Plex Mono Medium | wght 400–500 |

## Por que estático, e não a variável

Arquivo e IBM Plex Sans são publicadas pela Google como fonte VARIÁVEL
(`wght`/`wdth` num arquivo só). O `next/og` (satori) faz o parsing de `fvar`
mas **não implementa `gvar`** — confirmado em
`node_modules/next/dist/compiled/@vercel/og/index.node.js` (zero ocorrência de
`gvar`, a tabela que carrega a interpolação de glifo entre eixos). Embutir a
fonte variável renderizaria sempre na instância PADRÃO do arquivo (Regular,
wdth 100), silenciosamente errado — nem peso nem largura do manual, sem
nenhum erro no processo. Por isso os três arquivos aqui são instâncias
ESTÁTICAS, geradas pela própria Google a partir da fonte variável (é assim
que o "Download family" do fonts.google.com funciona: cada combinação
peso×largura nomeada vira um `.ttf` de verdade, sem eixo nenhum dentro).

`archivo-semiexpanded-bold.ttf` é a instância "SemiExpanded" (wdth 112.5,
Bold/700) — a mais próxima da faixa 105–112/600–700 que o manual pede entre
as larguras nomeadas que a Google gera (Condensed, Normal, SemiExpanded,
Expanded). IBM Plex Mono já é publicada estática por peso (sem eixo de
largura), então `ibm-plex-mono-medium.ttf` é o arquivo oficial, sem
conversão.

## Licença

As três são **SIL Open Font License 1.1** — permite embutir e redistribuir
dentro de software/documento livremente; só proíbe vender a fonte isolada e
usar o nome reservado (`Plex`, no caso da IBM) para uma versão MODIFICADA
com nome parecido. Nenhum dos dois se aplica aqui: os arquivos entram
inalterados, embutidos no build, nunca distribuídos como fonte à parte.

- Archivo — Copyright 2020 The Archivo Project Authors
  (https://github.com/Omnibus-Type/Archivo)
- IBM Plex Sans / IBM Plex Mono — Copyright © 2017 IBM Corp., com Reserved
  Font Name "Plex"

Texto completo da licença: https://openfontlicense.org

## Fonte de cada arquivo (para reproduzir ou atualizar)

Baixados em 29/08/2026 via `https://fonts.google.com/download/list?family=...`
(o mesmo endpoint que o botão "Download family" do site usa — devolve cada
instância estática já gerada pela Google, em vez do arquivo variável):

- Archivo SemiExpanded Bold: `fonts.gstatic.com/s/archivo/v25/...0vyVQ.ttf`
- IBM Plex Sans Regular: `fonts.gstatic.com/s/ibmplexsans/v23/...26g.ttf`
- IBM Plex Mono Medium: `fonts.gstatic.com/s/ibmplexmono/v20/...DNg.ttf`
