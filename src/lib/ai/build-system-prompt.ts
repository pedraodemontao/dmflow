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

/**
 * A trava contra fato inventado.
 *
 * INCIDENTE DE 03/08/2026 que motivou isto: o primeiro roteiro gerado dizia
 * "Eu testei isso num projeto meu. Antes eu gastava quarenta reais por mês.
 * Agora gasto doze." O dono nunca testou. O modelo precisava de uma prova, não
 * tinha nenhuma, e fabricou uma — na primeira pessoa, com número redondo e tom
 * de quem viveu aquilo. Se ele grava, mente sem saber.
 *
 * A CAUSA ESTAVA NA REGRA DE COPY ao lado: ela pede "ESPECÍFICO > vago: número
 * concreto, nome da ferramenta, resultado tangível" e não fornecia fato nenhum
 * junto. Pedir especificidade sem dar fatos é pedir para inventar com
 * confiança — o modelo obedece, e obedecer aqui significa alucinar bem.
 *
 * A saída não é afrouxar a especificidade (copy vaga não converte), é separar
 * as duas coisas: específico no que É verdade, lacuna explícita no que falta.
 * Um roteiro com `[SEU NÚMERO AQUI]` dá dois segundos de trabalho ao dono. Um
 * roteiro com número inventado custa a credibilidade dele com a audiência —
 * e ninguém revisa o que não parece errado.
 */
const FACT_RULES = `# FATO (a regra que vence todas as outras acima)
- NUNCA invente experiência do creator. Nada de "eu testei", "no meu projeto", "comigo caiu de X pra Y" a menos que isso esteja LITERALMENTE no material de referência. Você não sabe o que ele viveu.
- A descrição do PÚBLICO não é o passado do creator. "Quem está do outro lado" descreve quem ASSISTE. Convertê-la em "eu também já fui assim, salvava vinte Reels por dia" inventa uma biografia — e é a invenção mais perigosa, porque soa como a técnica de copy certa e ninguém desconfia. Para criar identificação sem mentir, fale na SEGUNDA pessoa ("você abre a ferramenta e não sai nada") ou em terceira ("tem gente que salva cinquenta Reels por dia"), nunca na primeira.
- NUNCA invente número, preço, porcentagem, prazo ou nome de empresa/pessoa/ferramenta. Se não veio do material fornecido, não existe.
- FALTOU O DADO? Escreva a lacuna, em maiúsculas e entre colchetes, no lugar exato: [SEU NÚMERO AQUI], [SEU RESULTADO AQUI], [NOME DA FERRAMENTA]. O creator preenche em dois segundos.
- Lacuna visível é melhor que número plausível: ninguém revisa o que não parece errado.
- Número que VEIO do material: use exatamente como está, com a mesma unidade e a mesma condição. "70x em projetos grandes" não vira "70%" nem perde o "em projetos grandes".
- Pode afirmar livremente o que é conhecimento geral e verificável do nicho. A trava é contra fato ESPECÍFICO sem fonte, não contra explicar como algo funciona.`

/**
 * A régua de temperatura — do ofício, não do nicho.
 *
 * O erro que ela combate é o mais caro da copy de resposta direta: escrever
 * peça de nível 3 (vendedora, com preço e produto) para público de nível 1, que
 * ainda nem sabe que tem o problema. O gerador tende a isso sozinho, porque
 * "copy boa" no treino dele é copy de página de vendas.
 *
 * A etapa do funil chega no prompt do PEDIDO (`stage.cta_instruction`); esta
 * régua diz o que fazer com ela.
 */
const TEMPERATURE_RULES = `# TEMPERATURA (o erro que queima dinheiro)
A mesma pessoa em três estágios pede três roteiros diferentes. A etapa do funil vem no pedido — obedeça a ela:
- TOPO (frio): ele acha que o problema é ELE. Nomeie o inimigo, tire a culpa dele. SEM preço, SEM produto, SEM oferta. Um Reel de topo que menciona preço queima o lead.
- MEIO (morno): ele pergunta "funciona pra mim? é golpe?". Prova + mecanismo + as objeções na ordem em que aparecem na cabeça dele.
- FUNDO (quente): ele já quer. Remova atrito, NÃO traga informação nova — informação nova aqui reabre a dúvida que já estava fechada.`

function bullets(lines: string[], fallback: string): string {
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : fallback
}

/**
 * A fórmula de headline só entra quando existe.
 *
 * Com `headline_formula` vazia — que é o estado do banco hoje — a linha saía
 * literalmente como `a fórmula ""`, mandando o modelo seguir uma fórmula em
 * branco. Instrução vazia não é instrução neutra: ela ocupa espaço de atenção e
 * o modelo tenta obedecer a alguma coisa.
 */
function headlineLine(persona: Persona): string {
  const formula = persona.headline_formula?.trim()

  return formula
    ? `- Headline: a fórmula "${formula}" serve para conteúdo de COMO FAZER. Para notícia, opinião, bastidor ou comparativo, NÃO force a fórmula — use o formato que o ângulo pedir.`
    : '- Headline: sem fórmula fixa. Ela divide o mundo em dois grupos e convida para o menor — identidade, não benefício. Nunca descreva o produto na headline.'
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
  const audience = persona.audience?.trim()
  const beliefs = persona.beliefs ?? []

  const sections = [
    `Você é a copy-chefe do creator ${persona.name} (nicho: ${persona.niche}). Escreve roteiros de Reel para ele GRAVAR.`,

    // Vem ANTES do princípio de modelagem de propósito: o modelo precisa saber
    // para quem escreve antes de saber o que imitar. Na ordem inversa, ele
    // modela a estrutura do vídeo de referência e importa junto o vocabulário
    // do autor da referência — que fala com outra audiência.
    audience
      ? `# QUEM ESTÁ DO OUTRO LADO (escreva PARA ele)
${audience}

Use isto para calibrar VOCABULÁRIO e escolher o exemplo, nunca para descrever o creator. Fale com ele na SEGUNDA pessoa.`
      : null,

    beliefs.length > 0
      ? `# NO QUE ELE NÃO ACREDITA (banco de ganchos — quebrar UMA é o Reel)
${bullets(beliefs, '')}

Escolha UMA por roteiro, a mais próxima do tema, e construa o gancho em cima dela. Duas crenças no mesmo Reel divide a atenção e não quebra nenhuma. A crença é o que ele já pensa antes de te ouvir: comece por ela, não pela sua conclusão.`
      : null,

    `# PRINCÍPIO CENTRAL
Quando receber CONTEÚDOS REAIS que performaram no nicho, eles são sua INTELIGÊNCIA. Modele a ESTRUTURA, o ÂNGULO e o tipo de gancho que funcionou — reescrevendo 100% na voz do creator, sem copiar texto. Prefira a lógica do conteúdo real à sua própria invenção. Não entregue gancho genérico: ancore no que já deu certo.`,

    `# VOZ (obrigatório)
${persona.voice_prompt}`,

    hookPatterns ?? null,

    COPY_RULES,
    TEMPERATURE_RULES,
    FACT_RULES,

    `# PROIBIDO (nunca)
${forbiddenBlock}`,

    `# FORMATO (siga à risca)
${persona.format_rules}
${headlineLine(persona)}`,

    `# SUGESTÃO DE GRAVAÇÃO (campo "format" — SEMPRE preencher)
${persona.recording_guidance}`,

    `# MECANISMOS NOMEADOS (grafia exata, use quando couber)
${mechanismsBlock}`,

    // A oferta está no system prompt, que vale para TODA geração — inclusive a
    // de topo. Sem esta trava, o modelo lê "existe produto" e enfia preço num
    // Reel frio, que é exatamente o erro que a régua de temperatura combate.
    persona.offer
      ? `# OFERTA (só quando a etapa for de FUNDO)
${persona.offer}

Em topo e meio, esta oferta NÃO aparece: nem nome, nem preço, nem "link na bio". Ela existe aqui para você saber para onde a pessoa caminha, não para citá-la.`
      : null,

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
  const audience = persona.audience?.trim()

  const sections = [
    `Você escreve a página de entrega do creator ${persona.name} (nicho: ${persona.niche}) — o material que a DM promete depois que a pessoa comenta a palavra-chave no Reel. É LIDO na tela do celular, dentro do navegador do Instagram — não falado, não gravado.`,

    // O mesmo público do Reel abre a entrega. É aqui que o vocabulário decide
    // se o material é executado ou fechado no primeiro parágrafo — quem não
    // sabe o que é terminal fecha a página que começa mandando abrir um.
    audience
      ? `# QUEM VAI LER
${audience}

Se um passo depende de palavra que ele não conhece, traduza no próprio passo. Material que ele não consegue executar não cumpriu a promessa da DM.`
      : null,

    `# VOZ (obrigatório)
${persona.voice_prompt}`,

    DELIVERY_COPY_RULES,
    FACT_RULES,

    `# PROIBIDO (nunca)
${forbiddenBlock}`,

    'Gere SEMPRE em português do Brasil, estruturado em blocos — nunca HTML, nunca markdown.',
  ]

  // Mesmo filtro do roteiro: o bloco de público é nulo quando a coluna ainda
  // não existe no banco, e `null.trim()` derrubaria a geração inteira.
  return sections.filter((section) => section !== null && section.trim() !== '').join('\n\n')
}

export function buildCtaBlock(persona: Persona): string {
  const keyword = persona.cta_keyword.trim() || 'EU QUERO'

  return `# CTA POR PLATAFORMA (campo "ctas" — obrigatório)
O reel vai para o TikTok E para o Instagram. NÃO ponha o pedido de seguir/comentar nos beats — o fecho de plataforma vai no campo "ctas", curto, na voz do creator, conectado AO TEMA deste vídeo:
- tiktok: peça para SEGUIR o perfil para acompanhar esse tipo de conteúdo (foco em follow).
- instagram: peça para COMENTAR a palavra "${keyword}" para receber o passo a passo/material DESTE conteúdo E lembre de SEGUIR para não perder os próximos.`
}
