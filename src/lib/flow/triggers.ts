import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Trigger, TriggerType } from '@/types/db'

/** "EU QUERO!" e "eu quéro" batem na mesma keyword. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function matches(trigger: Trigger, text: string): boolean {
  if (trigger.keywords.length === 0) return true

  const haystack = normalize(text)
  return trigger.keywords.some((keyword) => {
    const needle = normalize(keyword)
    if (trigger.match_mode === 'exact') return haystack === needle
    if (trigger.match_mode === 'starts_with') return haystack.startsWith(needle)
    return haystack.includes(needle)
  })
}

/**
 * Acha o trigger de maior prioridade que casa com o texto.
 * Para comentários, trigger com media_id preenchido só vale naquele post.
 * Se nada casar em DM, cai no trigger 'default' quando existir.
 */
export async function findTrigger(args: {
  accountId: string
  type: TriggerType
  text: string
  mediaId?: string
}): Promise<Trigger | null> {
  const { data } = await supabaseAdmin
    .from('triggers')
    .select('*')
    .eq('account_id', args.accountId)
    .eq('type', args.type)
    .eq('is_active', true)
    .order('priority', { ascending: false })

  const triggers = (data ?? []) as Trigger[]

  const scoped =
    args.type === 'comment'
      ? triggers.filter((t) => !t.media_id || t.media_id === args.mediaId)
      : triggers

  const hit = scoped.find((t) => matches(t, args.text))
  if (hit) return hit

  if (args.type === 'comment') return null

  const { data: fallback } = await supabaseAdmin
    .from('triggers')
    .select('*')
    .eq('account_id', args.accountId)
    .eq('type', 'default')
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (fallback as Trigger | null) ?? null
}
