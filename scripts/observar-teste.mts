/**
 * Observa um teste ao vivo do funil, do comentário até a página da entrega.
 *
 *   npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/observar-teste.mts [minutos]
 *
 * Só leitura. Fica olhando o banco e conta o que apareceu de novo desde que
 * subiu — evento na fila, envio, passo do fluxo, visita na entrega — com o
 * relógio ao lado de cada um.
 *
 * Existe por duas perguntas que nenhum teste automatizado responde:
 *
 *   1. O webhook entrega? Os dois caminhos gravam o mesmo `dedup_key`, mas o
 *      polling monta o `value` à mão e nunca põe `recipient`/`timestamp` na DM
 *      nem `media_product_type` no comentário (`poll.ts`). Campo que ele não
 *      tem como inventar é prova de que veio pela Meta.
 *   2. A Meta aceitou o payload? "Passa no vitest" não é "a DM chegou", e essa
 *      confusão já produziu feature que nunca funcionou sem ninguém saber.
 */
import { supabaseAdmin } from '../src/lib/supabase/admin'

const MINUTOS = Number(process.argv[2] ?? 6)
const inicio = new Date()
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const relogio = () => new Date().toISOString().slice(11, 19)
const desde = (d: string) => `+${Math.round((new Date(d).getTime() - inicio.getTime()) / 1000)}s`

/** Linha crua do banco: os campos vêm de `jsonb`, então tudo é desconhecido. */
type Bag = Record<string, unknown>
const bag = (valor: unknown): Bag => (valor ?? {}) as Bag

function origemDoEvento(payload: Bag): string {
  const kind = payload.kind as string | undefined
  const v = bag(payload.value)
  const media = bag(v.media)
  if (kind === 'messaging') return v.recipient || v.timestamp ? 'WEBHOOK' : 'varredura'
  if (kind === 'comment') return media.media_product_type || v.timestamp ? 'WEBHOOK' : 'varredura'
  return '?'
}

console.log(`observando por ${MINUTOS} min, a partir de ${relogio()}`)
console.log('comente "claude" em qualquer post, de uma conta que NÃO seja @nocodepedro\n')

const vistos = new Set<string>()
const corte = inicio.toISOString()

while (Date.now() - inicio.getTime() < MINUTOS * 60_000) {
  const [eventos, envios, runs, visitas] = await Promise.all([
    supabaseAdmin.from('webhook_events').select('dedup_key, payload, created_at, status').gte('created_at', corte),
    supabaseAdmin.from('send_log').select('id, kind, created_at, media_id').gte('created_at', corte),
    supabaseAdmin.from('flow_runs').select('id, status, current_node, updated_at').gte('updated_at', corte),
    supabaseAdmin.from('delivery_views').select('id, contact_id, created_at').gte('created_at', corte),
  ])

  for (const linha of (eventos.data ?? []) as Array<{
    dedup_key: string
    payload: Bag
    created_at: string
  }>) {
    const chave = `ev:${linha.dedup_key}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const v = bag(linha.payload.value)
    const quem = bag(v.from).username ?? bag(v.sender).id ?? '?'
    const texto = v.text ?? bag(v.message).text ?? ''
    console.log(
      `${relogio()} ${desde(linha.created_at).padStart(6)}  FILA [${origemDoEvento(linha.payload)}] ${linha.payload.kind} de @${quem}: ${JSON.stringify(texto)}`,
    )
  }

  for (const s of (envios.data ?? []) as Array<{
    id: string
    kind: string
    created_at: string
    media_id: string | null
  }>) {
    const chave = `envio:${s.id}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    console.log(`${relogio()} ${desde(s.created_at).padStart(6)}  ENVIO ${s.kind}${s.media_id ? ` no post ${s.media_id}` : ''}`)
  }

  for (const r of (runs.data ?? []) as Array<{
    id: string
    status: string
    current_node: string | null
    updated_at: string
  }>) {
    const chave = `run:${r.id}:${r.current_node}:${r.status}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    console.log(`${relogio()} ${desde(r.updated_at).padStart(6)}  FLUXO nó="${r.current_node}" [${r.status}]`)
  }

  for (const d of (visitas.data ?? []) as Array<{
    id: number
    contact_id: string | null
    created_at: string
  }>) {
    const chave = `visita:${d.id}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    console.log(
      `${relogio()} ${desde(d.created_at).padStart(6)}  ENTREGA ABERTA ${d.contact_id ? '(contato identificado pelo token)' : '(sem token — link colado à mão?)'}`,
    )
  }

  await espera(3000)
}

console.log(`\nfim. ${vistos.size} acontecimento(s) observado(s).`)
if (vistos.size === 0) console.log('nada aconteceu — ou o comentário não saiu, ou o gatilho não casou.')
