import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Trigger } from '@/types/db'

/**
 * O post nasce com a automação (card 04, fase 5).
 *
 * O bug que isto mata: automação com gatilho de comentário PRESO a um post
 * (`triggers.media_id`) não dispara no post novo. O matcher
 * (`src/lib/flow/triggers.ts`) descarta em silêncio, o tick responde ok:true,
 * e o lead comenta no vazio com a automação "ativa" no painel.
 *
 * Quando o tick publica um post com `flow_id`, cada gatilho de comentário
 * preso daquela automação é CLONADO com o `media_id` do post novo.
 *
 * - **Clonar, não redirecionar.** O gatilho do post antigo continua
 *   respondendo quem comenta lá.
 * - **Gatilho global não clona.** `media_id` nulo já vale para todo post;
 *   clonar criaria dois gatilhos disparando o mesmo fluxo no mesmo comentário.
 * - **Idempotente.** O tick retenta; um clone que já existe (mesmo flow,
 *   mesmo media_id, mesmas palavras) não nasce de novo.
 * - **Uma cópia por conjunto de palavras.** Automação presa a três posts
 *   antigos com as mesmas palavras vira UM gatilho no post novo, com a
 *   configuração mais recente.
 *
 * Erro aqui SOBE: quem chama decide o que fazer, e a decisão (drain.ts) é
 * manter `published` e pôr o erro na lista — gatilho que não nasceu é
 * exatamente o silêncio que este arquivo existe para acabar.
 */

function keywordsKey(trigger: Pick<Trigger, 'keywords' | 'match_mode'>): string {
  const words = trigger.keywords.map((k) => k.trim().toLowerCase()).sort()
  return `${trigger.match_mode}:${words.join('|')}`
}

export interface CloneResult {
  cloned: number
  skipped: number
}

export async function cloneTriggersForPublication(args: {
  flowId: string
  mediaId: string
}): Promise<CloneResult> {
  const { data, error } = await supabaseAdmin
    .from('triggers')
    .select('*')
    .eq('flow_id', args.flowId)
    .eq('type', 'comment')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`não consegui ler os gatilhos da automação: ${error.message}`)

  const triggers = (data ?? []) as Trigger[]
  const bound = triggers.filter((t) => t.media_id !== null)
  if (bound.length === 0) return { cloned: 0, skipped: triggers.length }

  const existing = new Set(triggers.filter((t) => t.media_id === args.mediaId).map(keywordsKey))
  const seen = new Set<string>()
  let cloned = 0
  let skipped = 0

  for (const trigger of bound) {
    const key = keywordsKey(trigger)
    if (trigger.media_id === args.mediaId || existing.has(key) || seen.has(key)) {
      skipped += 1
      continue
    }
    seen.add(key)

    const { error: insertError } = await supabaseAdmin.from('triggers').insert({
      account_id: trigger.account_id,
      flow_id: trigger.flow_id,
      type: 'comment',
      keywords: trigger.keywords,
      match_mode: trigger.match_mode,
      media_id: args.mediaId,
      public_reply: trigger.public_reply,
      priority: trigger.priority,
      is_active: trigger.is_active,
    })

    if (insertError) throw new Error(`não consegui clonar o gatilho ${trigger.id}: ${insertError.message}`)
    cloned += 1
  }

  return { cloned, skipped }
}
