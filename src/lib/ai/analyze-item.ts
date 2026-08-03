import { z } from 'zod'

import { AnthropicError, generateStructured, hasAnthropicKey } from '@/lib/ai/anthropic'
import type { LibraryItem } from '@/types/db'

/**
 * Ler um vídeo do nicho e dizer POR QUE ele funcionou.
 *
 * É o que transforma a biblioteca de lista de números em acervo de padrões. Os
 * campos `hook_text`, `structure`, `visual_format` e `format_desc` existem
 * desde a migration 0014 e estavam com zero de 40 preenchidos — o gerador de
 * roteiro prometia "modelar o vídeo que performou" e recebia uma legenda de
 * uma linha.
 *
 * O QUE ESTE ANALISADOR NÃO PODE FAZER, e é o mais importante entender: ele
 * não assistiu ao vídeo. Não existe transcrição, não existe áudio, e a Apify
 * não devolve nenhum dos dois. Pedir "qual foi o gancho falado nos 3 primeiros
 * segundos" produziria uma invenção convincente — exatamente o erro que a
 * trava de fato (`build-system-prompt.ts`) acabou de corrigir no gerador.
 *
 * Então o schema abaixo separa o que É observável do que seria adivinhação, e
 * cada campo carrega uma `confianca`. Um campo com `confianca: "baixa"` vale
 * como pista, não como padrão a copiar — e o gerador precisa saber a diferença.
 *
 * A matéria observável é: a legenda, as hashtags, os COMENTÁRIOS (o que o
 * vídeo provocou), a duração, a proporção da tela e o desempenho relativo.
 * Comentário é a peça mais subestimada: a legenda diz o que o autor quis
 * dizer, o comentário diz o que ficou na cabeça de quem viu.
 */

const confianca = z.enum(['alta', 'media', 'baixa'])

export const itemAnalysisSchema = z.object({
  /**
   * O gancho é o campo mais valioso e o mais perigoso: sem áudio, ele só pode
   * ser lido da legenda quando ela ABRE com a promessa. Quando a legenda é só
   * chamada para comentar ("Comenta TOKEN aqui embaixo"), a resposta honesta é
   * nula — e nula aqui vale mais que uma frase bem escrita e inventada.
   */
  hookText: z
    .string()
    .nullable()
    .describe('A abertura, SÓ se estiver literalmente na legenda. Nulo se a legenda não a contém.'),
  hookConfidence: confianca,

  tema: z.string().min(1).describe('Sobre o que é o conteúdo, em uma frase'),

  /** O que a pessoa prometeu entregar. Sai da legenda com frequência alta. */
  promessa: z.string().nullable().describe('O que o vídeo promete resolver ou entregar'),

  /**
   * A estrutura é INFERIDA da duração, do tema e dos comentários — nunca
   * observada. Por isso vem sempre acompanhada da confiança, e o prompt manda
   * dizer "provável" em vez de afirmar.
   */
  structure: z.string().min(1).describe('A estrutura provável do vídeo, em uma linha'),
  structureConfidence: confianca,

  /** Proporção e duração são fatos; o resto do formato é leitura. */
  visualFormat: z.string().min(1).describe('Formato provável: talking head, screencast, carrossel, etc.'),
  visualFormatConfidence: confianca,

  /**
   * O que os comentários revelam. É o campo mais confiável do conjunto, porque
   * é o único lido de texto que não foi escrito pelo autor para se promover.
   */
  reacaoDoPublico: z
    .string()
    .nullable()
    .describe('O que os comentários mostram: dúvida que ficou, o que pediram, onde travaram'),

  /** O tipo de CTA, que é o que interessa para quem monta automação. */
  ctaTipo: z
    .enum(['comentario_palavra', 'seguir', 'salvar', 'link_bio', 'nenhum', 'outro'])
    .describe('Que ação o vídeo pede'),
  ctaPalavra: z.string().nullable().describe('A palavra-chave pedida, se houver'),

  /**
   * O que faz este conteúdo valer como molde. Uma frase, para o gerador ler.
   * Vazio não é opção: se não dá para dizer por que funcionou, a análise não
   * serviu para nada e é melhor que isso apareça escrito.
   */
  porQueFuncionou: z.string().min(1).describe('Em uma frase: o que fez este conteúdo performar'),
})

export type ItemAnalysis = z.infer<typeof itemAnalysisSchema>

const SYSTEM = `Você analisa conteúdo de Instagram que performou acima da média do próprio autor, para servir de molde a roteiros novos.

# O QUE VOCÊ TEM, E O QUE VOCÊ NÃO TEM
Você NÃO assistiu ao vídeo. Não há transcrição nem áudio. Você tem: legenda, hashtags, comentários do público, duração, proporção de tela e desempenho relativo à mediana do autor.

# A REGRA QUE VENCE TODAS
- NUNCA escreva uma frase como se fosse falada no vídeo. Você não ouviu nada.
- \`hookText\` só é preenchido quando a ABERTURA DA LEGENDA é, ela mesma, o gancho. Legenda que só chama para comentar ("Comenta X aqui embaixo") NÃO tem gancho: devolva null. Null é a resposta certa e útil; frase inventada contamina todo roteiro que modelar este item.
- \`structure\` e \`visualFormat\` são INFERÊNCIA. Escreva como inferência ("provável talking head com corte para tela") e marque a confiança honestamente.
- Confiança ALTA só quando a evidência está literal no material. MÉDIA quando há sinal forte e indireto. BAIXA quando é palpite razoável.
- Prefira dizer menos com precisão a dizer mais com invenção. Este texto vai virar molde de conteúdo real.

# ONDE MORA O SINAL
- COMENTÁRIOS são a evidência mais honesta: a legenda é marketing do autor, o comentário é reação de quem viu. A pergunta que se repete revela o que o vídeo deixou em aberto — e é aí que mora o próximo conteúdo.
- DURAÇÃO indica formato: até ~20s é gancho único; 30-60s comporta problema e solução; acima de 90s é aula ou demonstração.
- PROPORÇÃO 1,78 é vertical de reel; perto de 1,0 é quadrado, normalmente carrossel ou foto.
- PUBLI teve empurrão pago: o desempenho dela não prova o mesmo que o de um post orgânico.`

function buildPrompt(item: LibraryItem, medianPlays: number | null): string {
  const comments = (item.top_comments ?? []) as Array<{ text: string; author: string | null }>
  const desempenho =
    item.outlier && medianPlays
      ? `${item.outlier.toFixed(1)}× a mediana do autor (mediana ${medianPlays})`
      : 'desempenho relativo desconhecido'

  return [
    `# O CONTEÚDO`,
    `Autor: @${item.owner_handle ?? 'desconhecido'}`,
    `Tipo: ${item.post_type ?? 'desconhecido'}`,
    `Duração: ${item.duration_sec ? `${item.duration_sec}s` : 'desconhecida'}`,
    `Proporção (altura÷largura): ${item.aspect_ratio ?? 'desconhecida'}`,
    `Plays: ${item.plays ?? 0} · Curtidas: ${item.likes ?? 0} · Comentários: ${item.comments ?? 0}`,
    `Desempenho: ${desempenho}`,
    item.is_paid_partnership ? `PUBLI — teve empurrão pago.` : '',
    (item.hashtags ?? []).length > 0 ? `Hashtags: ${(item.hashtags ?? []).join(' ')}` : '',
    ``,
    `# LEGENDA (escrita pelo autor)`,
    item.caption?.trim() || '(sem legenda)',
    ``,
    `# COMENTÁRIOS (reação de quem viu — a evidência mais honesta)`,
    comments.length > 0
      ? comments.map((c) => `- ${c.author ? `@${c.author}: ` : ''}${c.text}`).join('\n')
      : '(nenhum comentário capturado — isso reduz sua confiança em reacaoDoPublico, que deve vir null)',
  ]
    .filter(Boolean)
    .join('\n')
}

export interface AnalyzeResult {
  output: ItemAnalysis
  model: string
  tokensIn: number
  tokensOut: number
}

/**
 * Analisa um item. Lança em vez de devolver um resultado morno: quem chama
 * processa uma fila e precisa saber qual item falhou para tentar de novo — e,
 * ao contrário do gerador de roteiro, aqui não há dono esperando na tela para
 * quem valha a pena devolver meia resposta.
 */
export async function analyzeLibraryItem(args: {
  item: LibraryItem
  medianPlays: number | null
}): Promise<AnalyzeResult> {
  if (!hasAnthropicKey()) throw new AnthropicError('ANTHROPIC_API_KEY não configurada')

  const result = await generateStructured({
    schema: itemAnalysisSchema,
    system: SYSTEM,
    prompt: buildPrompt(args.item, args.medianPlays),
    toolName: 'registrar_analise',
    toolDescription: 'Registra a leitura do conteúdo, com a confiança de cada inferência',
    // Leitura estruturada de material dado, não criação. Mesmo degrau da
    // entrega — e são dezenas de chamadas, onde o preço por item aparece.
    task: 'delivery',
  })

  return {
    output: result.output,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  }
}
