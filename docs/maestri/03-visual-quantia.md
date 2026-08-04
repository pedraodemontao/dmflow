# CARD 03 — o painel veste a QUANTIA

> Pré-requisito: leia `00-contexto.md` e `../marca/quantia-manual.md`.
> O manual é a fonte da verdade. Onde este card e ele divergirem, o manual vence.

## Por que não é "trocar as cores"

O painel hoje está na direção "Marcador": preto `#050506`, lime `#d6f24a`, Anton. Foi uma
direção deliberada e bem executada — e agora está errada, porque a marca existe.

Mais que errada: **o design atual reprova em dois itens da nota de auditoria do próprio
manual**, e os dois são reprovação automática, não preferência.

```
--success: var(--green-400)   →  "verde como positivo"    = reprovado
--danger:  var(--coral-400)   →  "vermelho como negativo" = reprovado
```

O manual não recusa verde/vermelho por gosto. Recusa porque o par **colapsa sob protanopia**
(ΔE 13,5, indistinguível) enquanto Azul-Aferição × Âmbar-Ferrugem sobrevive (ΔE 58,7). E porque
verde/vermelho é a gramática de *dashboard* — que é exatamente o gênero errado para um produto
cuja tese é "isto é um extrato, não um painel".

Duas coisas o design atual já acerta e devem ser preservadas: **sombra sem blur** e **raio de
2px** (o manual reprova qualquer raio ≥ 4px e qualquer blur > 0).

## Fase 1 — os tokens

`src/app/globals.css`. É um arquivo, e as telas herdam quase tudo porque já usam variáveis
semânticas em vez de cor crua.

```
--paper-50   #FBFAF7    --ink-900  #14181B    --blue-600  #0F4C6B   (acento, <10%)
--paper-100  #F2F0E9    --ink-600  #4C545A    --blue-700  #0A3A52   (hover)
--paper-200  #E8E5DC    --ink-500  #636B72    --amber-600 #9A4416   (a linha negativa)
--paper-300  #D5D1C6    --ink-400  #868D93    --amber-300 #E0904E
--paper-500  #8A8476    --ink-100  #E9E7DF    --blue-300  #74B4D6
--surface-900 #0E1114   --surface-800 #171B1F  --surface-700 #2A3036  --surface-600 #646C73
--shadow-sheet  3px 3px 0 0 #D5D1C6   (claro)  ·  4px 4px 0 0 rgb(0 0 0 / .55)  (escuro)
--measure 68ch
```

**O tema claro é o principal.** "Papel e tinta fazem 93% da área." Isso inverte o projeto, que
hoje é escuro por padrão — e é a inversão que faz o painel ler como documento em vez de
ferramenta.

**A regra 60-30-10 é a que mais se quebra sem perceber:** se o azul aparecer em qualquer coisa
que não seja um botão ou um saldo positivo, o CTA perde a disputa e a tela deixa de ter um único
ponto de ação. O manual chama isso de "a falha mais fácil de cometer e a mais cara".

## Fase 2 — tipografia

Três famílias, com uma regra semântica que decide tudo: **proporcional para o que a marca diz,
monoespaçado para o que a marca mediu. Se é dado, é mono. Sem exceção.**

| | Família | Uso |
|---|---|---|
| Display | Archivo 600–700, `wdth` 105–112 | títulos |
| Texto | IBM Plex Sans 400–600 | corpo, medida travada em 68ch |
| Dado | IBM Plex Mono 400–500, `tnum` | **todo número**, e os rótulos em caixa alta com `+0.09em` |

O rótulo em mono caixa alta é descrito no manual como "o ativo tipográfico da marca — é o que faz
qualquer peça ler como documento antes de ser lida como texto". O projeto já tem a classe
`.label` fazendo exatamente isso; ela sobrevive à migração trocando de família.

Nunca abaixo de 16px para corpo em mobile: abaixo disso o iOS aplica zoom automático em campo e
quebra o layout.

## Fase 3 — onde o produto encosta na marca

O painel tem telas que **são** extratos e não sabem disso. Migrá-las é mais que trocar cor:

- **Métricas de automação** e **insights do vídeo** viram documento com linha, sinal e saldo.
- Todo número passa a mono tabular alinhado à direita, para as colunas fecharem.
- Onde houver polaridade (conversão que subiu, cap estourado, run falhado), usar **três canais
  antes da cor**: sinal `+/−`, parênteses contábeis no negativo, sufixo `C/D`. A tela precisa
  funcionar impressa em preto e branco; a cor é redundância, nunca o único indicador.

## O que NÃO fazer

- Verde para positivo, vermelho para negativo — reprovação automática.
- Polaridade comunicada só por cor.
- Raio ≥ 4px, pill/999px, qualquer gradiente, qualquer sombra com blur.
- Azul em algo que não seja botão ou saldo positivo.
- Corpo abaixo de 16px em mobile.
- Remover o anel de foco.
- Clichê visual de IA — robô, cérebro, circuito, rede neural, foguete. "A marca não é sobre IA.
  É sobre a auditoria da IA."

## Definição de pronto

- [ ] Quatro comandos verdes
- [ ] Nenhuma ocorrência de verde-positivo / vermelho-negativo em `globals.css` ou componente
- [ ] Uma tela de número impressa em preto e branco continua legível
- [ ] Tema claro e escuro, com o claro como padrão
- [ ] O cabeçalho de `globals.css` atualizado: ele documenta as cinco revisões da direção
      anterior e passa a documentar a sexta, com o motivo da troca
