/**
 * A persona do @nocodepedro, escrita a partir do avatar canônico do SOLO.
 *
 *   npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/persona-solo.mts
 *
 * FONTES (não invente nada fora delas):
 *   ~/projects/solo/02-avatar.md            avatar canônico — Rafael, as 10 frases, as 8 crenças
 *   ~/projects/solo/00-produto.md           oferta, preço, formato
 *   ~/projects/solo/03-metodo.md            os quatro movimentos
 *   ~/Claude-Memory/.../project_solo.md     decisões travadas em 2026-08-10
 *   ~/projects/paInel-nocode-pedro/docs/persona.md   a persona master
 *
 * Exige a migration 0020 (colunas `audience` e `beliefs`). Sem ela o script
 * avisa e não escreve nada — em vez de gravar metade e deixar a persona num
 * estado que ninguém sabe qual é.
 */
import { supabaseAdmin } from '../src/lib/supabase/admin'

/**
 * O público, em TERCEIRA pessoa — a forma importa tanto quanto o conteúdo.
 * Escrito em primeira, isto viraria a biografia do creator na boca do modelo,
 * que é a invenção mais perigosa que o gerador comete (ver `FACT_RULES`).
 */
const AUDIENCE = `Rafael, cerca de 31 anos, Brasil — capital ou cidade média. CLT que odeia o próprio trabalho, ou freelancer de marketing / infoprodutor iniciante. Renda de R$ 3 a 20 mil, instável: vive o dinheiro do mês.
Consome de 50 a 100 Reels por dia sobre IA e empreendedorismo, pico das 20h às 23h, na cama. Salva tudo e executa quase nada. Já tentou dropshipping, curso e agência — fracassou ou abandonou. Acha que não sabe programar, mesmo quando não precisa. Tem medo de fracassar publicamente de novo.
Muitas vezes ele AINDA NÃO VENDE NADA: não pressuponha CNPJ, faturamento nem operação rodando.
O que trava não é falta de ideia nem falta de técnica — é que toda tentativa anterior começou do zero.

VOCABULÁRIO — fala com confiança: empreender, sair do CLT, liberdade, tráfego pago, funil, renda passiva, produto digital, infoproduto, faturamento, ticket, ChatGPT.
Entende mas não usa: vibe coding, Claude Code, Lovable, no-code, SaaS, MVP, API.
NÃO conhece, traduza sempre que aparecer: terminal, deploy, hospedagem, backend, frontend, repositório, GitHub.`

/** Banco de ganchos: cada linha é um Reel possível. Na voz literal dele. */
const BELIEFS = [
  'Não sei programar, isso não é pra mim.',
  'IA e vibe coding é hype, vai passar igual NFT.',
  'Já saturou, tem muita gente fazendo isso.',
  'Preciso saber muito antes de começar.',
  'Não tenho dinheiro pra ferramenta. (mas paga Netflix e iFood)',
  'Se eu fizer e não der certo de novo, vou ser zoado.',
  'Não tenho tempo. (mas passa 3 a 4 horas por dia vendo Reel do tema)',
  'Não tenho ideia do que criar.',
]

/**
 * A voz — e a única passagem do sistema que autoriza a primeira pessoa.
 *
 * `FACT_RULES` proíbe converter a descrição do público em memória do creator, e
 * a proibição está certa: o modelo fabricava biografia lendo "salva 50 Reels
 * por dia". Mas o avatar canônico registra que a conversão do @nocodepedro vem
 * justamente do "eu também travei nisso" — e no caso dele isso é FATO, não
 * técnica de copy.
 *
 * A saída é declarar o fato aqui, no campo da persona, onde ele deixa de ser
 * invenção e passa a ser material fornecido. O que continua proibido é o
 * detalhe que não está escrito: número, empresa, prazo, resultado.
 */
const VOICE = `Pedro fala como quem constrói na frente de você. Direto, sem enrolação, sem hype. Mostra a tela, mostra o que quebrou, mostra como resolveu.
Frase curta. Português falado, não escrito. Se travar ao ler em voz alta, encurta.

IRMÃO MAIS VELHO, NUNCA GURU. O Pedro é o público cinco anos à frente: também era CLT, também achava que não sabia programar, também tentou coisas que não deram certo antes. Isto é FATO do creator, fornecido aqui — pode ser dito na primeira pessoa. O que NÃO pode é acrescentar detalhe que não está nesta linha: número, empresa, prazo ou resultado específico.
Consequência prática: número sozinho soa guru; número precedido do fracasso soa irmão mais velho. "Olha como é fácil" está proibido; "eu também travei nisso, olha como eu saí" é a voz certa.`

/**
 * A oferta. Só entra em roteiro de FUNDO — a trava está no system prompt, e
 * está lá porque o campo vale para toda geração, inclusive a de topo.
 */
const OFFER = `SOLO — comunidade e ferramenta para quem toca o negócio sozinho, no @nocodepedro. R$ 397 no plano anual ou R$ 297 no trimestral, com 7 dias antes da primeira cobrança.
O membro escolhe um agente do Arsenal (conteúdo, avatar, copy, DM, cobrança), roda DENTRO da plataforma e sai com o resultado — sem instalar nada, sem terminal, sem precisar saber o que é repositório. Resultado primeiro, competência depois.
O método são quatro movimentos, sempre nesta ordem: RODA (um sistema pronto funcionando no primeiro dia), ABRE (ver como foi feito), TROCA (adaptar para o caso dele), MONTA (construir sem molde). O princípio é NUNCA DO ZERO — o inimigo nomeado é a folha em branco.
PROIBIDO ao falar disso: chamar de curso, framework, metodologia ou passo a passo (é "o método" ou "os quatro movimentos"); prometer faturamento; citar ganho de membro. A prova é sempre do próprio Pedro, no passado e na primeira pessoa.`

/**
 * O jargão que o SOLO cunhou. Estava vazio, e vazio custava caro: sem isto o
 * gerador escrevia "passo a passo" e "metodologia" — as duas palavras que o
 * método proíbe — porque nada no prompt dizia como aquilo se chama.
 */
const MECHANISMS = [
  {
    name: 'os quatro movimentos',
    desc: 'RODA, ABRE, TROCA, MONTA — sempre nesta ordem e no imperativo. Nunca chamar de framework, metodologia ou passo a passo.',
  },
  { name: 'NUNCA DO ZERO', desc: 'o princípio: se precisou abrir arquivo vazio, o método falhou ali.' },
  { name: 'a folha em branco', desc: 'o inimigo nomeado — o que trava não é falta de técnica, é começar do zero toda vez.' },
  { name: 'o Arsenal', desc: 'o acervo de agentes prontos que o membro roda dentro da plataforma.' },
  { name: 'Modo Solo', desc: 'a trilha guiada de quem toca o negócio sozinho.' },
]

/**
 * DURAÇÃO — corrigida aqui porque o dado contradizia o código.
 *
 * `format_rules` mandava "60 a 150 segundos" enquanto `MAX_DURATION_SEC` (50s,
 * decisão de formato do dono em 04/08) manda o pedido pedir no máximo 50. O
 * modelo recebia as duas instruções na mesma geração: uma no system, outra no
 * prompt do pedido. Instrução contraditória não produz erro — produz roteiro
 * longo demais que só aparece na hora de gravar.
 */
const FORMAT_RULES = `Talking head + SCREENCAST (mostrar a ferramenta na tela é o diferencial do nicho). Até 50 segundos — vídeo curto é o padrão; passar disso só quando o assunto exigir de verdade. Gancho nos 3 primeiros segundos: resultado ou contradição, com texto-choque na tela. Legenda queimada sempre. Estrutura: Hook → Problema → Demonstração na tela → Prova → CTA. Um Reel faz UM ponto. Caption longa (250+ caracteres) contando o caso + CTA + 5 a 7 hashtags.`

/**
 * `--preview` monta o system prompt final e imprime, sem tocar no banco.
 *
 * Existe porque a copy é do dono, não minha: ele precisa LER o que o gerador
 * vai receber antes de isso virar roteiro gravado. Não exige a migration — a
 * persona é montada em memória.
 */
if (process.argv.includes('--preview')) {
  const { buildSystemPrompt } = await import('../src/lib/ai/build-system-prompt')
  const { data: atual } = await supabaseAdmin.from('personas').select('*').limit(1).single()

  console.log(
    buildSystemPrompt({
      ...(atual as Record<string, unknown>),
      audience: AUDIENCE,
      beliefs: BELIEFS,
      voice_prompt: VOICE,
      offer: OFFER,
      named_mechanisms: MECHANISMS,
      format_rules: FORMAT_RULES,
      headline_formula: '',
    } as Parameters<typeof buildSystemPrompt>[0]),
  )
  process.exit(0)
}

const { data: contas } = await supabaseAdmin.from('accounts').select('id, username').eq('is_active', true)
const conta = ((contas ?? []) as Array<{ id: string; username: string }>)[0]
if (!conta) throw new Error('nenhuma conta ativa')

// A migration é colada à mão: confirmar a coluna ANTES de escrever é o que
// separa "não rodou" de "rodou metade".
const { error: sonda } = await supabaseAdmin.from('personas').select('audience, beliefs').limit(1)
if (sonda) {
  console.error('✗ migration 0020 ainda não aplicada:', sonda.message)
  console.error('  Cole `supabase/migrations/0020_persona_publico.sql` no SQL Editor e rode de novo.')
  process.exit(1)
}

const { data, error } = await supabaseAdmin
  .from('personas')
  .update({
    audience: AUDIENCE,
    beliefs: BELIEFS,
    voice_prompt: VOICE,
    offer: OFFER,
    named_mechanisms: MECHANISMS,
    format_rules: FORMAT_RULES,
    // Vazia de propósito: a mecânica que o dono quer ("divide o mundo em dois
    // grupos e convida para o menor") é o fallback do prompt, e cabe mal como
    // fórmula de preencher lacuna.
    headline_formula: '',
    updated_at: new Date().toISOString(),
  })
  .eq('account_id', conta.id)
  .eq('is_active', true)
  .select('name, cta_keyword')

if (error) throw new Error(`persona não atualizada: ${error.message}`)

const linhas = (data ?? []) as Array<{ name: string; cta_keyword: string }>
console.log(`@${conta.username}: ${linhas.length} persona(s) atualizada(s)`)
for (const linha of linhas) {
  console.log(`   ${linha.name} · CTA "${linha.cta_keyword}" · ${BELIEFS.length} crenças no banco de ganchos`)
}
