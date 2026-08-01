import { z } from 'zod'

import { loadModelingContext, type ContextProblem } from '@/lib/ai/context'
import { generateScript } from '@/lib/ai/generate'
import { generateDelivery } from '@/lib/ai/generate-delivery'
import { generateDeliverySlug } from '@/lib/ai/slug'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Delivery, Script as ScriptRow } from '@/types/db'

/**
 * "Gerar roteiro modelado": pega um vídeo da biblioteca que performou bem no
 * nicho e escreve um roteiro NOVO, na voz do dono, usando aquele vídeo como
 * molde. Em seguida, uma SEGUNDA chamada ao modelo escreve a ENTREGA — o
 * material que o CTA do roteiro prometeu — para fechar o funil:
 * biblioteca → roteiro → entrega (página nossa) → automação manda o link.
 * Roteiro e entrega usam prompts separados de propósito: um prompt só produz
 * uma coisa morna que não serve para nenhum dos dois (ver card 01, Fase 2).
 *
 * Rota de servidor, e isso é requisito de segurança, não de arquitetura: a
 * `ANTHROPIC_API_KEY` só existe aqui. Ela não está em `PUBLIC_PATHS`, então o
 * proxy exige a sessão do painel — não adicione.
 */

/**
 * A chamada ao modelo é o gargalo, e uma retentativa de schema dobra o tempo.
 * O padrão da Vercel corta uma geração longa no meio.
 *
 * Sem `export const dynamic` de propósito: rota só de POST nunca é cacheada, e
 * no Next 16 essa opção saiu da tabela de configuração de segmento (some de vez
 * com Cache Components ligado). As rotas de GET do projeto ainda a usam porque
 * lá ela significa alguma coisa.
 */
export const maxDuration = 120

const bodySchema = z.object({
  libraryItemId: z.string().uuid(),
  funnelStage: z.enum(['topo', 'meio', 'fundo']).default('meio'),
  /** Texto livre porque é uma FAIXA ("60-120"), não um número. */
  duration: z.string().trim().min(1).max(20).default('60-120'),
  theme: z.string().trim().max(200).optional(),
  /** Remix: escreve sobre outro pilar usando o mesmo molde. */
  pillarId: z.string().uuid().optional(),
})

const PROBLEM_RESPONSE: Record<ContextProblem, { status: number; error: string }> = {
  'sem-conta': { status: 409, error: 'Nenhuma conta do Instagram conectada.' },
  'item-nao-encontrado': { status: 404, error: 'Conteúdo não encontrado na biblioteca.' },
  'sem-persona': {
    status: 409,
    error: 'Nenhuma persona ativa. Cadastre a persona antes de gerar roteiro.',
  },
  'sem-etapa': {
    status: 409,
    error: 'Etapa de funil sem CTA cadastrado para esta persona.',
  },
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ ok: false, error: 'Dados inválidos.' }, { status: 400 })
  }

  const { libraryItemId, funnelStage, duration, theme, pillarId } = parsed.data
  const loaded = await loadModelingContext({
    libraryItemId,
    funnelStage,
    pillarId,
    theme: theme ?? null,
  })

  if (!loaded.ok) {
    const { status, error } = PROBLEM_RESPONSE[loaded.problem]
    return Response.json({ ok: false, error }, { status })
  }

  const context = loaded.context

  const generated = await generateScript({
    persona: context.persona,
    stage: context.stage,
    pillar: context.pillarName,
    theme: theme ?? null,
    duration,
    refs: context.refs,
    modeledOn: context.item,
    hookPatterns: context.hookPatterns,
  })

  const { data, error } = await supabaseAdmin
    .from('scripts')
    .insert({
      account_id: context.accountId,
      persona_id: context.persona.id,
      pillar_id: context.pillar?.id ?? null,
      funnel_stage: funnelStage,
      theme: theme ?? null,
      duration,
      source_library_item_id: context.item.id,
      output: generated.output,
      model_used: generated.model,
      tokens_in: generated.tokensIn,
      tokens_out: generated.tokensOut,
    })
    .select('*')
    .single()

  if (error) {
    // O roteiro existe mas não foi gravado. Devolver 500 sem ele faria o dono
    // pagar a geração duas vezes; devolver o texto salva o trabalho.
    console.error('[scripts] falha ao gravar roteiro:', error.message)
    return Response.json(
      { ok: false, error: 'Roteiro gerado, mas não foi possível salvar.', script: generated.output },
      { status: 500 },
    )
  }

  const script = data as ScriptRow

  // Segunda chamada: a entrega cumpre a promessa LITERAL do CTA do roteiro,
  // não o tema — se o vídeo prometeu "mapa de 7 passos", a entrega tem 7
  // passos. Sempre nasce em 'draft': roteiro gerado nem sempre presta, e a
  // entrega só fica no ar quando o dono publicar (Fase 5).
  const generatedDelivery = await generateDelivery({
    persona: context.persona,
    stage: context.stage,
    promise: generated.output.ctas.instagram.fala,
  })

  const { data: deliveryRow, error: deliveryError } = await supabaseAdmin
    .from('deliveries')
    .insert({
      account_id: context.accountId,
      script_id: script.id,
      library_item_id: context.item.id,
      slug: generateDeliverySlug(generatedDelivery.output.title),
      title: generatedDelivery.output.title,
      subtitle: generatedDelivery.output.subtitle ?? null,
      blocks: generatedDelivery.output.blocks,
      status: 'draft',
    })
    .select('*')
    .single()

  if (deliveryError) {
    // Mesma regra do roteiro: a entrega existe mesmo que a gravação falhe.
    // O roteiro JÁ foi salvo, então a resposta segue `ok: true` — só a
    // entrega precisa ser gerada de novo, não o roteiro inteiro.
    console.error('[deliveries] falha ao gravar entrega:', deliveryError.message)
    return Response.json({
      ok: true,
      script,
      delivery: null,
      deliveryError: 'Entrega gerada, mas não foi possível salvar.',
      deliveryOutput: generatedDelivery.output,
    })
  }

  return Response.json({ ok: true, script, delivery: deliveryRow as Delivery })
}
