import { AutomationEditor } from '@/components/automacoes/automation-editor'
import { loadMedia } from '@/lib/media'

export const dynamic = 'force-dynamic'

export default async function NovaAutomacaoPage() {
  const { media, error } = await loadMedia()
  return <AutomationEditor media={media} mediaError={error} />
}
