import { buildCtaBlock, buildSystemPrompt } from '@/lib/ai/build-system-prompt'
import { AnthropicError, generateStructured, hasAnthropicKey } from '@/lib/ai/anthropic'
import { formatRefs } from '@/lib/ai/retrieve'
import { HOOK_VARIANTS, scriptSchema, type Script } from '@/lib/ai/schemas'
import type { FunnelStage, LibraryItem, Persona } from '@/types/db'

/**
 * O gerador de roteiro.
 *
 * Dois caminhos: Anthropic quando há chave, mock determinístico quando não há.
 * O mock não é enfeite — é o que faz a tela funcionar sem chave e o que permite
 * testar o fluxo inteiro sem gastar crédito. Ele também é montado a partir da
 * persona, e não de texto de um nicho específico: mock com o nicho de outra
 * pessoa cravado no código seria a mesma armadilha que o resto deste diretório
 * existe para evitar.
 */

export interface GenerateScriptInput {
  persona: Persona
  stage: FunnelStage
  pillar: string
  theme: string | null
  duration: string
  /** O acervo que serve de grounding. Vazio é legítimo: biblioteca nova. */
  refs: LibraryItem[]
  /** O vídeo que serve de molde. É o que diferencia "gerar" de "modelar". */
  modeledOn?: LibraryItem | null
  hookPatterns?: string | null
  /**
   * O que já funcionou com a audiência DELE. Opcional: sem vídeo medido
   * suficiente o bloco não existe, e prompt sem bloco é melhor que prompt com
   * bloco vazio pedindo para aprender com nada.
   */
  ownPerformance?: string | null
}

export interface GeneratedScript {
  output: Script
  model: string
  /** `null` no mock: não houve chamada, e gravar 0 fingiria que houve. */
  tokensIn: number | null
  tokensOut: number | null
}

export const MOCK_MODEL = 'mock'

const TOOL_NAME = 'entregar_roteiro'
const TOOL_DESCRIPTION =
  'Entrega o roteiro de Reel completo, em português do Brasil, na voz do creator.'

/** Quanto da legenda do vídeo-molde entra no prompt. */
const CAPTION_EXCERPT = 220

/**
 * Teto de duração. Decisão de formato do dono, 04/08/2026: vídeo curto é o
 * padrão, e longo só quando o assunto exigir de verdade. Modelar continua
 * valendo — a estrutura vem da referência — mas o tempo é nosso.
 */
export const MAX_DURATION_SEC = 50

function themeLine(input: GenerateScriptInput): string {
  return input.theme?.trim() || '(livre, escolha o ângulo mais forte do pilar)'
}

/**
 * O prompt do pedido. Duas formas: modelado num vídeo real (o botão da
 * biblioteca) ou a partir de pilar + tema, com a biblioteca inteira como
 * referência. O que muda entre elas é o grounding, não as regras — regra é
 * system prompt.
 */
export function buildUserPrompt(input: GenerateScriptInput): string {
  const closing = `Entregue: a headline na fórmula, ${HOOK_VARIANTS} variações de gancho de 3s, o roteiro completo em beats (texto de tela + fala), os CTAs por plataforma (campo "ctas"), a legenda longa com hashtags e a sugestão de gravação (campo "format").`

  if (input.modeledOn) {
    const molde = input.modeledOn
    // A DURAÇÃO VEM DO MOLDE, não do formulário. Um vídeo de 42s tem outro
    // arco que um de 120s: menos beats, um ponto só, corte mais seco. Pedir
    // 120s "modelado" num vídeo de 42s não produz uma versão longa do mesmo
    // conteúdo — produz outro conteúdo, com estrutura de página de venda
    // pendurada num gancho emprestado. Foi exatamente o que saiu em 04/08.
    //
    // MAS COM TETO. O dono grava vídeo curto por decisão de formato (04/08):
    // longo só quando o assunto exigir. Molde de 77s vira roteiro de 50s — e o
    // prompt precisa dizer COMO encurtar, senão o modelo mantém os mesmos
    // beats e só fala mais rápido, que é o pior dos dois mundos.
    const segundosDoMolde = molde.duration_sec ?? (Number(input.duration) || MAX_DURATION_SEC)
    const precisaCondensar = segundosDoMolde > MAX_DURATION_SEC
    const duracaoAlvo = Math.min(segundosDoMolde, MAX_DURATION_SEC)

    return `Crie um roteiro de Reel NOVO para ${input.persona.name}, MODELADO neste conteúdo real que JÁ PERFORMOU no nicho. Copie a INTELIGÊNCIA (formato, estrutura, tipo de gancho) — NÃO o texto. Reescreva tudo na voz dele, no tema dele (${input.persona.niche}).

# CONTEÚDO DE REFERÊNCIA (modele isto)
- Autor: @${molde.owner_handle ?? '?'} (${molde.plays} plays${molde.outlier !== null ? `, ${molde.outlier}× a mediana do próprio perfil` : ''})
- Formato visual: ${molde.visual_format ?? '?'}
- Gancho original: ${molde.hook_text ?? '?'}
- Estrutura que funcionou: ${molde.structure ?? '?'}
- Legenda original: "${molde.caption.slice(0, CAPTION_EXCERPT)}"

PILAR: ${input.pillar}
TEMA/ÂNGULO: ${themeLine(input)}
DURAÇÃO ALVO: ${duracaoAlvo} segundos.${
      precisaCondensar
        ? ` A referência tem ${segundosDoMolde}s e você vai condensar. Condensar é CORTAR IDEIA, não acelerar a fala: fique com o arco principal e o ponto mais forte, e descarte os secundários inteiros. Um roteiro de ${duracaoAlvo}s falado no ritmo normal cabe em cerca de ${Math.round((duracaoAlvo / 60) * 140)} palavras — se passar disso, você escreveu longo demais e vai sair corrido no vídeo.`
        : ` É a MESMA do vídeo de referência, e isso não é negociável. Menos tempo significa MENOS beats e um ponto só, não a mesma quantidade de ideias falada mais rápido.`
    }
${input.stage.cta_instruction}

# A REFERÊNCIA MANDA NA FORMA
Mantenha o MESMO tipo de arco, o MESMO número aproximado de beats e a MESMA densidade de ideias do vídeo de referência. O que muda é o TEMA e a VOZ; o esqueleto é dele.
Se a instrução da etapa acima pedir algo que não cabe nesse formato — quebrar objeções, listar preço, dar régua de qualificação — DEIXE DE FORA. Isso é estrutura de página de venda, e ela não entra num Reel de referência curta. Um Reel faz UM ponto.
${input.ownPerformance ? `\n${input.ownPerformance}\n` : ''}
${buildCtaBlock(input.persona)}

${closing}`
  }

  const refs = input.refs.length > 0 ? formatRefs(input.refs) : '(biblioteca ainda vazia)'

  return `Crie um roteiro de Reel para ${input.persona.name}.
PILAR: ${input.pillar}
TEMA/GANCHO ESPECÍFICO: ${themeLine(input)}
DURAÇÃO ALVO: ${input.duration} segundos
${input.stage.cta_instruction}

# CONTEÚDOS REAIS DO NICHO QUE PERFORMARAM (sua INTELIGÊNCIA — modele o ângulo, o gancho e a estrutura NISSO, reescreva 100% na voz do creator)
${refs}
${input.ownPerformance ? `\n${input.ownPerformance}\n` : ''}
${buildCtaBlock(input.persona)}

${closing}`
}

export async function generateScript(input: GenerateScriptInput): Promise<GeneratedScript> {
  if (!hasAnthropicKey()) {
    return { output: mockScript(input), model: MOCK_MODEL, tokensIn: null, tokensOut: null }
  }

  try {
    const result = await generateStructured({
      schema: scriptSchema,
      system: buildSystemPrompt(input.persona, input.hookPatterns),
      prompt: buildUserPrompt(input),
      toolName: TOOL_NAME,
      toolDescription: TOOL_DESCRIPTION,
    })

    return {
      output: result.output,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }
  } catch (error) {
    // Provedor fora do ar, chave inválida, rate limit, schema teimoso: a tela
    // continua entregando um roteiro. `model_used` grava `mock`, então dá para
    // separar depois o que a IA escreveu do que o fallback escreveu.
    const detail = error instanceof AnthropicError ? error.message : String(error)
    console.error('[ai] geração falhou, caindo no mock:', detail)
    return { output: mockScript(input), model: MOCK_MODEL, tokensIn: null, tokensOut: null }
  }
}

/**
 * Fallback determinístico: mesma entrada, mesmo roteiro.
 *
 * Determinismo é o ponto — é o que permite testar o caminho inteiro (rota,
 * validação, gravação) sem rede e sem crédito, e o que faz a tela ter algo
 * para mostrar antes de a chave existir.
 */
export function mockScript(input: GenerateScriptInput): Script {
  const keyword = input.persona.cta_keyword.trim() || 'EU QUERO'
  const theme = (input.theme?.trim() || input.pillar).trim()
  const themeLower = theme.toLowerCase()
  const molde = input.modeledOn ?? input.refs[0] ?? null
  const isTopo = input.stage.key === 'topo'

  const ctaFala = isTopo
    ? 'Comenta aqui o que você achou e salva para não perder.'
    : `Comenta ${keyword} aqui embaixo que eu te mando o passo a passo.`

  return {
    headline: `${theme}: o caminho curto que ${input.persona.niche} ignora`,
    hooks: [
      { tela: theme, fala: `Ninguém no ${input.persona.niche} te conta isso sobre ${themeLower}.` },
      { tela: 'Faz junto comigo', fala: `Para tudo: vou te mostrar na tela como eu faço ${themeLower}.` },
      { tela: 'O erro de sempre', fala: `A maioria erra ${themeLower} logo no primeiro passo. Olha.` },
    ],
    beats: [
      { beat: 'Gancho (0-3s)', tela: theme, fala: `Ninguém no ${input.persona.niche} te conta isso sobre ${themeLower}.` },
      { beat: 'Problema (4-15s)', tela: 'O jeito antigo trava', fala: 'O caminho que todo mundo segue custa tempo e não entrega o resultado.' },
      {
        beat: 'Demonstração (16-45s)',
        tela: 'Mostrando na tela',
        fala: molde
          ? 'Vou te mostrar o passo a passo, modelado no que já funcionou aqui no nicho.'
          : 'Vou te mostrar o passo a passo, do jeito que eu faço.',
      },
      { beat: 'Prova (46-60s)', tela: 'Resultado real', fala: 'Esse é o resultado. Replicável, e você faz hoje mesmo.' },
      { beat: 'CTA', tela: isTopo ? 'Salva e segue' : `Comenta ${keyword}`, fala: ctaFala },
    ],
    caption: `Se você quer resolver ${themeLower} sem enrolação, esse é o caminho. ${
      isTopo ? '' : `Comenta ${keyword} que eu te mando o passo a passo. `
    }Salva para fazer depois.`,
    ctas: {
      tiktok: {
        tela: 'SEGUE PARA ACOMPANHAR',
        fala: `Segue aqui que eu mostro ${themeLower} toda semana.`,
      },
      instagram: {
        tela: `Comenta ${keyword}`,
        fala: `Comenta ${keyword} aqui que eu te mando o passo a passo. E me segue para não perder os próximos.`,
      },
    },
    format: {
      tipo: molde?.visual_format?.includes('screencast') ? 'talking head + screencast' : 'talking head',
      dica: 'Grave falando para a câmera e mostre a tela durante a demonstração. Legenda queimada em cada beat, cortes médios.',
    },
  }
}
