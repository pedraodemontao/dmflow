import { z } from 'zod'

import type { Persona } from '@/types/db'

/**
 * O coração do porte: a inteligência do gerador é DADO, não código.
 *
 * Voz, proibições, formato, fórmula de headline, mecanismos nomeados e a
 * palavra-chave do CTA vivem em `personas`; o CTA por etapa em `funnel_stages`;
 * os temas em `content_pillars`; o grounding em `library_items`. Este arquivo
 * só COSTURA essas linhas num prompt. É o que permite trocar de nicho editando
 * o banco em vez de reescrever o gerador.
 *
 * O que fica fixo aqui é regra de PRODUTO, não de nicho — o princípio de
 * modelagem e as regras de copy abaixo valem para qualquer creator. Se alguma
 * frase daqui só faz sentido para um nicho, ela está no lugar errado e o lugar
 * certo é uma coluna de `personas`.
 */

/** Mecanismo nomeado: um jargão que o creator cunhou e escreve sempre igual. */
const namedMechanismSchema = z.object({
  name: z.string().min(1),
  desc: z.string().default(''),
})

export type NamedMechanism = z.infer<typeof namedMechanismSchema>

/**
 * `named_mechanisms` é `jsonb` — o banco aceita qualquer coisa ali.
 * Linha malformada vira lista vazia em vez de derrubar a geração: o roteiro
 * sem os jargões ainda é útil; a exceção no meio do fluxo não é.
 */
export function parseNamedMechanisms(raw: unknown): NamedMechanism[] {
  const parsed = z.array(namedMechanismSchema).safeParse(raw)
  return parsed.success ? parsed.data : []
}

/**
 * Regras de copy fixas: separam copy de amador de copy de pro e combatem o que
 * o modelo tende a fazer sozinho — clichê, prolixidade, vago. Não são do
 * nicho, são do ofício; por isso ficam no código e não em `personas`.
 */
const COPY_RULES = `# REGRA DE COPY (siga à risca — isto separa amador de pro)
- FALA = fala de gente, não redação. Frases curtas (máx ~12 palavras). Lê em voz alta: se travou, encurta.
- BANIDOS (clichê de IA, nunca use): "cansado de", "você está perdendo tempo", "a real é que", "o segredo é", "deixa eu te mostrar", "olha só", "imagina poder", "e o melhor", "isso mesmo", "simples assim", "pode parecer", "acredite", "não vai acreditar".
- ESPECÍFICO > vago: número concreto, nome da ferramenta, resultado tangível.
- HOOK (3s) = tensão real: contradição, perda ou resultado chocante. Nunca pergunta morna ("você sabia que..."). Stakes nos 3 primeiros segundos.
- ZERO enchimento: cada beat avança a ideia. Beat que não muda nada na cabeça de quem vê, corta.
- PROVA antes de promessa: mostra a tela/resultado, depois conclui. Não prometa, demonstre.`

function bullets(lines: string[], fallback: string): string {
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : fallback
}

/**
 * Monta o system prompt a partir da persona.
 *
 * `hookPatterns` é o bloco de ganchos campeões minerado da própria biblioteca
 * (ver `retrieve.ts`). Opcional: biblioteca vazia gera prompt sem ele em vez de
 * gerar prompt com um bloco vazio pedindo para o modelo imitar nada.
 */
export function buildSystemPrompt(persona: Persona, hookPatterns?: string | null): string {
  const mechanisms = parseNamedMechanisms(persona.named_mechanisms)
  const mechanismsBlock = bullets(
    mechanisms.map((mechanism) => `"${mechanism.name}": ${mechanism.desc}`),
    '(nenhum mecanismo nomeado ainda)',
  )
  const forbiddenBlock = bullets(persona.forbidden_rules, '(sem regras definidas)')

  const sections = [
    `Você é a copy-chefe do creator ${persona.name} (nicho: ${persona.niche}). Escreve roteiros de Reel para ele GRAVAR.`,

    `# PRINCÍPIO CENTRAL
Quando receber CONTEÚDOS REAIS que performaram no nicho, eles são sua INTELIGÊNCIA. Modele a ESTRUTURA, o ÂNGULO e o tipo de gancho que funcionou — reescrevendo 100% na voz do creator, sem copiar texto. Prefira a lógica do conteúdo real à sua própria invenção. Não entregue gancho genérico: ancore no que já deu certo.`,

    `# VOZ (obrigatório)
${persona.voice_prompt}`,

    hookPatterns ?? null,

    COPY_RULES,

    `# PROIBIDO (nunca)
${forbiddenBlock}`,

    `# FORMATO (siga à risca)
${persona.format_rules}
- Headline: a fórmula "${persona.headline_formula}" serve para conteúdo de COMO FAZER. Para notícia, opinião, bastidor ou comparativo, NÃO force a fórmula — use o formato que o ângulo pedir.`,

    `# SUGESTÃO DE GRAVAÇÃO (campo "format" — SEMPRE preencher)
${persona.recording_guidance}`,

    `# MECANISMOS NOMEADOS (grafia exata, use quando couber)
${mechanismsBlock}`,

    persona.offer ? `# OFERTA (fundo de funil)\n${persona.offer}` : null,

    'Gere SEMPRE em português do Brasil. As falas são palavra por palavra, prontas para ele ler.',
  ]

  return sections.filter((section) => section !== null && section.trim() !== '').join('\n\n')
}

/**
 * O fecho por plataforma.
 *
 * A divisão TikTok = seguir / Instagram = comentar a palavra é decisão de
 * produto (o mesmo vídeo vai para os dois canais), mas a PALAVRA vem de
 * `personas.cta_keyword` — é ela que liga o roteiro à automação de DM do
 * dm-flow: o lead comenta a palavra, o gatilho dispara, o fluxo responde.
 */
/**
 * Regra de copy da ENTREGA — texto LIDO, não falado. O roteiro tem a versão
 * dele acima (`COPY_RULES`) porque as duas peças são lidas de formas
 * diferentes: confundi-las produz um texto morno que não serve para nenhuma
 * das duas (ver card 01, Fase 2).
 */
const DELIVERY_COPY_RULES = `# REGRA DE COPY DA ENTREGA (texto LIDO, não falado — siga à risca)
- ESCANEÁVEL: quem abriu veio buscar o que foi prometido, não ler um texto corrido. Frases curtas, um parágrafo por ideia.
- CUMPRA A PROMESSA LITERAL: o que o CTA do vídeo prometeu é o contrato. Prometeu 7 passos, entregue 7 passos — nem 5, nem 9.
- SEM GANCHO, SEM REABRIR A VENDA: quem chegou aqui já está convencido. Vá direto ao conteúdo prometido.
- ESPECÍFICO > vago: número concreto, nome da ferramenta, passo acionável.
- BANIDOS (clichê de IA, nunca use): "cansado de", "a real é que", "o segredo é", "deixa eu te mostrar", "olha só", "imagina poder", "e o melhor", "simples assim", "acredite", "não vai acreditar".`

/**
 * Monta o system prompt da entrega a partir da persona — mesma fonte de
 * verdade do roteiro (voz e proibições vêm de `personas`), regra de copy
 * diferente porque a peça é diferente.
 */
export function buildDeliverySystemPrompt(persona: Persona): string {
  const forbiddenBlock = bullets(persona.forbidden_rules, '(sem regras definidas)')

  const sections = [
    `Você escreve a página de entrega do creator ${persona.name} (nicho: ${persona.niche}) — o material que a DM promete depois que a pessoa comenta a palavra-chave no Reel. É LIDO na tela do celular, dentro do navegador do Instagram — não falado, não gravado.`,

    `# VOZ (obrigatório)
${persona.voice_prompt}`,

    DELIVERY_COPY_RULES,

    `# PROIBIDO (nunca)
${forbiddenBlock}`,

    'Gere SEMPRE em português do Brasil, estruturado em blocos — nunca HTML, nunca markdown.',
  ]

  return sections.filter((section) => section.trim() !== '').join('\n\n')
}

export function buildCtaBlock(persona: Persona): string {
  const keyword = persona.cta_keyword.trim() || 'EU QUERO'

  return `# CTA POR PLATAFORMA (campo "ctas" — obrigatório)
O reel vai para o TikTok E para o Instagram. NÃO ponha o pedido de seguir/comentar nos beats — o fecho de plataforma vai no campo "ctas", curto, na voz do creator, conectado AO TEMA deste vídeo:
- tiktok: peça para SEGUIR o perfil para acompanhar esse tipo de conteúdo (foco em follow).
- instagram: peça para COMENTAR a palavra "${keyword}" para receber o passo a passo/material DESTE conteúdo E lembre de SEGUIR para não perder os próximos.`
}
