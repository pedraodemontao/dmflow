import { AutomationEditor } from '@/components/automacoes/automation-editor'
import { getFlowOptions } from '@/lib/data'
import { loadMedia } from '@/lib/media'

export const dynamic = 'force-dynamic'

export default async function NovaAutomacaoPage() {
  const [{ media, error }, flowOptions] = await Promise.all([loadMedia(), getFlowOptions()])
  return <AutomationEditor media={media} mediaError={error} flowOptions={flowOptions} />
}
