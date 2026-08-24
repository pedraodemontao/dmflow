/**
 * Liga a automação do `claude` na entrega certa e apaga o que entrega errado.
 *
 *   ...scripts/ativar-automacoes.mts             mostra o diff, não grava nada
 *   ...scripts/ativar-automacoes.mts --aplicar   grava
 *
 * (prefixo: `npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json`)
 *
 * Escrito como script e não como clique no painel porque são sete mudanças em
 * quatro tabelas que só fazem sentido juntas: publicar a entrega sem vincular
 * ao fluxo não muda nada, e trocar o link do fluxo sem publicar a entrega
 * manda um 404. Idempotente — rodar duas vezes não faz nada na segunda.
 *
 * O que ele conserta, medido em 24/08 por `scripts/auditoria.mts`:
 *   - `mapa` estava ATIVO preso ao post 18109404692003644, cuja legenda pede
 *     "eu quero" e não "mapa" — nunca disparou. E entregava um link 404.
 *   - os dois fluxos ativos mandavam `low-ia.vercel.app` enquanto os posts
 *     prometiam o passo a passo do Claude Code.
 *   - o material que cumpre essa promessa existia no banco, em rascunho.
 */
import { supabaseAdmin } from '../src/lib/supabase/admin'
import { flowDefinitionSchema } from '../src/lib/flow/types'

/**
 * ORDEM OBRIGATÓRIA: o `{{presente}}` em `button.url` só passa a valer depois
 * que o schema corrigido estiver EM PRODUÇÃO. O engine faz
 * `flowDefinitionSchema.parse(flow.definition)` a cada passo (`engine.ts`),
 * então gravar isto contra um build antigo faz TODA execução do fluxo lançar —
 * exatamente o tipo de quebra silenciosa que este projeto já pagou uma vez.
 * Deploy primeiro, `--aplicar` depois.
 */
const APLICAR = process.argv.includes('--aplicar')

const ENTREGA_DO_CLAUDE = 'passo-a-passo-instalando-e-usando-o-claude-code-lhd9qp'
const FLUXO_DO_CLAUDE = 'Comentário → Claude Code'
const LINK_ANTIGO = 'https://low-ia.vercel.app/'

const mudancas: string[] = []
function plano(linha: string) {
  mudancas.push(linha)
  console.log(`  ${APLICAR ? '→' : '·'} ${linha}`)
}

const { data: contaRow } = await supabaseAdmin.from('accounts').select('id, username').single()
const conta = contaRow as { id: string; username: string }
console.log(`conta @${conta.username}${APLICAR ? '' : '   (SIMULAÇÃO — nada será gravado)'}\n`)

// ---------------------------------------------------------------------------
// 1. Gatilhos que não podem disparar, ou que disparam para o lugar errado.
// ---------------------------------------------------------------------------
console.log('GATILHOS')
const { data: gatilhos } = await supabaseAdmin
  .from('triggers')
  .select('id, keywords, media_id, is_active')
  .eq('account_id', conta.id)

for (const g of (gatilhos ?? []) as Array<{
  id: string
  keywords: string[]
  media_id: string | null
  is_active: boolean
}>) {
  const palavra = (g.keywords ?? [])[0]
  if (!g.is_active) continue

  const motivo =
    palavra === 'mapa'
      ? `preso ao post ${g.media_id} (que pede "eu quero") e entregando um 404`
      : palavra === 'checklist'
        ? 'nenhum post pede essa palavra'
        : null
  if (!motivo) continue

  plano(`desligar gatilho "${palavra}" — ${motivo}`)
  if (APLICAR) {
    const { error } = await supabaseAdmin
      .from('triggers')
      .update({ is_active: false })
      .eq('id', g.id)
    if (error) throw new Error(`falha ao desligar "${palavra}": ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// 2. O material sai do rascunho. Sem isto a página pública responde 404.
// ---------------------------------------------------------------------------
console.log('\nENTREGA')
const { data: entregaRow } = await supabaseAdmin
  .from('deliveries')
  .select('id, slug, title, status')
  .eq('slug', ENTREGA_DO_CLAUDE)
  .single()
const entrega = entregaRow as { id: string; slug: string; title: string; status: string }

if (entrega.status !== 'published') {
  plano(`publicar "${entrega.title}" → /e/${entrega.slug}`)
  if (APLICAR) {
    const { error } = await supabaseAdmin
      .from('deliveries')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', entrega.id)
    if (error) throw new Error(`falha ao publicar a entrega: ${error.message}`)
  }
} else {
  console.log(`  = "${entrega.title}" já está publicada`)
}

// ---------------------------------------------------------------------------
// 3. O fluxo do `claude` passa a mandar o presente, e não mais o link externo.
// ---------------------------------------------------------------------------
console.log('\nFLUXOS')
const { data: fluxos } = await supabaseAdmin
  .from('flows')
  .select('id, name, is_active, definition, delivery_id')
  .eq('account_id', conta.id)

const fluxoClaude = (fluxos ?? []).find((f) => (f as { name: string }).name === FLUXO_DO_CLAUDE) as
  | { id: string; name: string; definition: Record<string, unknown>; delivery_id: string | null }
  | undefined
if (!fluxoClaude) throw new Error(`fluxo "${FLUXO_DO_CLAUDE}" não encontrado`)

const trocado = JSON.parse(
  JSON.stringify(fluxoClaude.definition).split(LINK_ANTIGO).join('{{presente}}'),
) as unknown

const precisaTrocarLink = JSON.stringify(fluxoClaude.definition).includes(LINK_ANTIGO)
if (precisaTrocarLink) {
  // O painel valida por este mesmo schema ao abrir. Gravar definição que ele
  // recusa deixaria o fluxo rodando e o editor quebrado — pior que não mexer.
  const conferido = flowDefinitionSchema.safeParse(trocado)
  if (!conferido.success) {
    throw new Error(
      `definição inválida depois da troca: ${conferido.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' | ')}`,
    )
  }
  plano(`"${FLUXO_DO_CLAUDE}": trocar ${LINK_ANTIGO} por {{presente}} nos botões`)
}

if (fluxoClaude.delivery_id !== entrega.id) {
  plano(`"${FLUXO_DO_CLAUDE}": vincular a entrega "${entrega.title}"`)
}

if (precisaTrocarLink || fluxoClaude.delivery_id !== entrega.id) {
  if (APLICAR) {
    const { error } = await supabaseAdmin
      .from('flows')
      .update({ definition: trocado, delivery_id: entrega.id })
      .eq('id', fluxoClaude.id)
    if (error) throw new Error(`falha ao atualizar o fluxo do claude: ${error.message}`)
  }
}

// Fluxo ativo sem gatilho vivo não dispara, mas continua aparecendo como ligado
// no painel — e o "Nova automação" ainda guarda o link 404 no bloco de entrega.
for (const nome of ['Nova automação', 'Comentário → checklist']) {
  const f = (fluxos ?? []).find((x) => (x as { name: string }).name === nome) as
    | { id: string; name: string; is_active: boolean }
    | undefined
  if (!f?.is_active) continue
  plano(`desligar fluxo "${nome}" — o gatilho dele acabou de ser desligado`)
  if (APLICAR) {
    const { error } = await supabaseAdmin.from('flows').update({ is_active: false }).eq('id', f.id)
    if (error) throw new Error(`falha ao desligar o fluxo "${nome}": ${error.message}`)
  }
}

console.log(
  `\n${mudancas.length} mudança(s) ${APLICAR ? 'aplicada(s)' : 'previstas — rode com --aplicar para gravar'}`,
)
