/**
 * Lê os roteiros gerados sem abrir o navegador.
 *
 *   npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/ver-roteiros.mts        lista
 *   npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/ver-roteiros.mts 3      abre o 3
 *
 * A tela `/biblioteca/roteiros` faz o mesmo com mais conforto; isto existe para
 * quando o trabalho já está no terminal e abrir o painel custa mais que ler.
 */
import { supabaseAdmin } from '../src/lib/supabase/admin'
import type { Script } from '../src/lib/ai/schemas'

interface Row {
  id: string
  funnel_stage: string
  duration: string | null
  model_used: string | null
  created_at: string
  output: Script
}

const { data, error } = await supabaseAdmin
  .from('scripts')
  .select('id, funnel_stage, duration, model_used, created_at, output')
  .order('created_at', { ascending: false })

if (error) throw new Error(`roteiros indisponíveis: ${error.message}`)

const rows = (data ?? []) as Row[]
if (rows.length === 0) {
  console.log('nenhum roteiro gerado ainda')
  process.exit(0)
}

const escolhido = Number(process.argv[2])

if (!Number.isInteger(escolhido) || escolhido < 1 || escolhido > rows.length) {
  console.log(`${rows.length} roteiros — mais novo primeiro\n`)
  rows.forEach((row, i) => {
    const data = row.created_at.slice(0, 10).split('-').reverse().join('/')
    // `mock` é o fallback determinístico: marcar aqui evita que um roteiro do
    // fallback seja lido como texto que a IA escreveu.
    const modelo = row.model_used === 'mock' ? ' · MOCK (fallback, não é IA)' : ''
    console.log(`${String(i + 1).padStart(2)}. ${row.output.headline}`)
    console.log(`    ${data} · ${row.funnel_stage} · ${row.duration ?? '?'}s${modelo}`)
  })
  console.log('\nAbrir um: scripts/ver-roteiros.mts <número>')
  process.exit(0)
}

const row = rows[escolhido - 1]
const o = row.output

console.log(`\n${o.headline}`)
console.log(`${row.created_at.slice(0, 10)} · etapa ${row.funnel_stage} · ${row.duration ?? '?'}s · ${row.model_used}\n`)

console.log('GANCHOS')
o.hooks.forEach((h, i) => {
  console.log(`  ${i + 1}. [tela] ${h.tela}`)
  console.log(`     ${h.fala}`)
})

console.log('\nROTEIRO')
for (const b of o.beats) {
  console.log(`  ${b.beat}`)
  console.log(`    [tela] ${b.tela}`)
  console.log(`    ${b.fala}`)
}

console.log('\nCTA')
console.log(`  instagram [tela] ${o.ctas.instagram.tela}`)
console.log(`            ${o.ctas.instagram.fala}`)
console.log(`  tiktok    [tela] ${o.ctas.tiktok.tela}`)
console.log(`            ${o.ctas.tiktok.fala}`)

console.log('\nLEGENDA')
console.log(o.caption.split('\n').map((l) => `  ${l}`).join('\n'))

console.log('\nGRAVAÇÃO')
console.log(`  ${o.format.tipo} — ${o.format.dica}\n`)
