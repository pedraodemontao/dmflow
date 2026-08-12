/**
 * Analisa itens da biblioteca — os de maior outlier primeiro.
 *   npx tsx scripts/analisar-biblioteca.mts [quantidade] [@perfil]
 * Cada item é uma chamada paga. Só pega quem ainda não foi analisado.
 *
 * O `@perfil` existe porque a fila é ordenada por multiplicador, e um vídeo de
 * terceiro que fez 54× a mediana dele sempre passará na frente dos teus — que
 * competem contra a tua própria mediana e raramente passam de 3×. Sem o
 * filtro, o acervo do dono nunca chega ao topo da fila e nunca é analisado.
 */
import { analyzeLibraryItem } from '../src/lib/ai/analyze-item'
import { supabaseAdmin } from '../src/lib/supabase/admin'
import type { LibraryItem } from '../src/types/db'

const limite = Number(process.argv[2] ?? 5)
const perfil = process.argv[3]?.replace(/^@/, '')

let query = supabaseAdmin.from('library_items').select('*').is('analyzed_at', null)

if (perfil) {
  // Com o perfil escolhido a mão, item sem multiplicador ENTRA. O número mede
  // se o vídeo performou; a análise lê forma — gancho, estrutura, formato
  // visual —, e forma existe mesmo em post que a Graph nunca mediu (39 dos 49
  // do dono não têm insight e nunca terão: não há coleta retroativa).
  // `buildPrompt` já escreve "sem régua" quando o outlier é nulo.
  query = query.eq('owner_handle', perfil)
} else {
  query = query.not('outlier', 'is', null)
}

const { data: rows } = await query.order('outlier', { ascending: false }).limit(limite)

const items = (rows ?? []) as LibraryItem[]
const { data: perfis } = await supabaseAdmin.from('tracked_profiles').select('username, median_plays')
const mediana = new Map(
  ((perfis ?? []) as Array<{ username: string; median_plays: number | null }>).map((p) => [
    p.username,
    p.median_plays,
  ]),
)

console.log(`analisando ${items.length} itens\n`)
let tokensIn = 0
let tokensOut = 0

for (const item of items) {
  try {
    const r = await analyzeLibraryItem({
      item,
      medianPlays: mediana.get(item.owner_handle ?? '') ?? null,
    })
    tokensIn += r.tokensIn
    tokensOut += r.tokensOut
    const a = r.output

    await supabaseAdmin
      .from('library_items')
      .update({
        hook_text: a.hookText,
        structure: `${a.structure} [confiança ${a.structureConfidence}]`,
        visual_format: `${a.visualFormat} [confiança ${a.visualFormatConfidence}]`,
        format_desc: a.porQueFuncionou,
        analyzed_at: new Date().toISOString(),
        analysis_model: r.model,
      })
      .eq('id', item.id)

    // `outlier` é `numeric` e chega como string; nulo quando o item não tem
    // régua. `Number(null)` daria 0 — "performou zero" em vez de "não medido".
    const multiplicador = item.outlier === null ? 'sem régua' : `${Number(item.outlier).toFixed(1)}×`
    console.log(
      `── @${item.owner_handle} · ${multiplicador} · ${item.duration_sec ?? '?'}s`,
    )
    console.log(`   gancho     ${a.hookText ?? '(nulo — a legenda não o contém)'} [${a.hookConfidence}]`)
    console.log(`   tema       ${a.tema}`)
    console.log(`   promessa   ${a.promessa ?? '(nenhuma)'}`)
    console.log(`   estrutura  ${a.structure} [${a.structureConfidence}]`)
    console.log(`   formato    ${a.visualFormat} [${a.visualFormatConfidence}]`)
    console.log(`   público    ${a.reacaoDoPublico ?? '(sem sinal)'}`)
    console.log(`   CTA        ${a.ctaTipo}${a.ctaPalavra ? ` "${a.ctaPalavra}"` : ''}`)
    console.log(`   POR QUÊ    ${a.porQueFuncionou}\n`)
  } catch (error) {
    console.error(`✗ @${item.owner_handle}:`, String(error).slice(0, 200), '\n')
  }
}

console.log(`tokens: ${tokensIn} entrada · ${tokensOut} saída`)
