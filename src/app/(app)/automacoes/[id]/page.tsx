import { notFound } from 'next/navigation'

import { AutomationEditor } from '@/components/automacoes/automation-editor'
import { getAutomation, getFlowOptions } from '@/lib/data'
import { loadMedia } from '@/lib/media'

export const dynamic = 'force-dynamic'

export default async function EditarAutomacaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [automation, { media, error }, allFlows] = await Promise.all([
    getAutomation(id),
    loadMedia(),
    getFlowOptions(),
  ])
  if (!automation) notFound()

  const { trigger, flow } = automation
  // O próprio fluxo não pode ser destino de "pular para outro fluxo" — pular
  // para si mesmo reenviaria o começo em loop.
  const flowOptions = allFlows.filter((f) => f.id !== flow.id)

  return (
    <AutomationEditor
      triggerId={trigger.id}
      media={media}
      mediaError={error}
      flowOptions={flowOptions}
      initial={{
        name: flow.name,
        triggerType: trigger.type,
        keywords: trigger.keywords,
        matchMode: trigger.match_mode,
        mediaId: trigger.media_id,
        publicReply: trigger.public_reply,
        isActive: trigger.is_active,
        definition: flow.definition,
      }}
    />
  )
}
