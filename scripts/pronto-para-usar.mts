/**
 * Confere se a operação está de pé, sem enviar nada.
 *
 *   npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/pronto-para-usar.mts
 *
 * Só leitura: nenhuma DM, nenhuma escrita, nenhuma chamada paga. Existe porque
 * "o painel abre" não é a mesma pergunta que "o sistema entrega" — em 30/07 o
 * app respondeu 200 por 22 horas com a automação morta.
 */
import { getOwnPerformance, MIN_POSTS_PARA_APRENDER } from '../src/lib/ai/own-performance'
import { supabaseAdmin } from '../src/lib/supabase/admin'

const { data: contas } = await supabaseAdmin
  .from('accounts')
  .select('id, username, is_active, automations_paused, token_expires_at, comments_cursor')

for (const conta of (contas ?? []) as Array<{
  id: string
  username: string
  is_active: boolean
  automations_paused: boolean
  token_expires_at: string
  comments_cursor: string | null
}>) {
  const diasDeToken = Math.round(
    (new Date(conta.token_expires_at).getTime() - Date.now()) / 86_400_000,
  )
  const atrasoDoCursor = conta.comments_cursor
    ? Math.round((Date.now() - new Date(conta.comments_cursor).getTime()) / 60_000)
    : null

  console.log(`@${conta.username}`)
  console.log(`  conta ativa .......... ${conta.is_active ? 'sim' : 'NÃO'}`)
  console.log(`  automação pausada .... ${conta.automations_paused ? 'SIM — nada dispara' : 'não'}`)
  console.log(`  token expira em ...... ${diasDeToken} dias`)
  console.log(
    `  última varredura ..... ${atrasoDoCursor === null ? 'NUNCA' : `${atrasoDoCursor} min atrás`}`,
  )

  const { data: fluxos } = await supabaseAdmin
    .from('flows')
    .select('id, name, is_active')
    .eq('account_id', conta.id)

  const { data: gatilhos } = await supabaseAdmin
    .from('triggers')
    .select('id, type, keywords, is_active, flow_id')
    .eq('account_id', conta.id)

  const ativos = (gatilhos ?? []).filter((g) => (g as { is_active: boolean }).is_active)
  console.log(`  fluxos ............... ${(fluxos ?? []).length}`)
  for (const f of (fluxos ?? []) as Array<{ name: string; is_active: boolean }>) {
    console.log(`     ${f.is_active ? '●' : '○'} ${f.name}`)
  }
  console.log(`  gatilhos ativos ...... ${ativos.length} de ${(gatilhos ?? []).length}`)
  for (const g of ativos as Array<{ type: string; keywords: string[] | null }>) {
    console.log(`     ${g.type}: ${(g.keywords ?? []).join(', ') || '(sem palavra-chave)'}`)
  }

  const desempenho = await getOwnPerformance(conta.id)
  console.log(
    `  gerador aprende com os teus vídeos: ${
      desempenho
        ? `SIM — ${desempenho.amostra} medidos (mínimo ${MIN_POSTS_PARA_APRENDER})`
        : `não — faltam vídeos com view coletada (mínimo ${MIN_POSTS_PARA_APRENDER})`
    }`,
  )
  if (desempenho) {
    const melhor = desempenho.melhores[0]
    console.log(
      `     melhor: ${melhor.dmPorMilViews} DM/mil views (${melhor.viraramDM} de ${melhor.views})`,
    )
  }
}
