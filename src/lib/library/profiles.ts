/**
 * De quem a raspagem puxa — a lista curada e como ela entra no banco.
 *
 * A curadoria é do dono e está anotada em `data/perfis.json` do projeto
 * `paInel-nocode-pedro` (`_meta.notes`, 02/07/2026). Duas decisões que valem
 * repetir aqui, porque quem ler só o código não vai adivinhar:
 *
 *  - "TODOS que ele segue são referência — não só os com 'IA' no nome.
 *    Marketing/vendas/edição entram como swipe de FORMATO e gancho."
 *  - "Ao raspar: começar por br-ia-negocios + infoproduto-ia + vibe-coding
 *    (PT, direto reaproveitável). Intl entra como 2ª camada (modelar gancho,
 *    não copiar copy)."
 *
 * Por isso a lista abaixo é a PRIMEIRA CAMADA: as três categorias em
 * português, 31 perfis. As outras seis categorias do arquivo original ficam de
 * fora até o dono decidir gastar crédito com elas — 31 perfis × 12 posts já é
 * um quinto do crédito mensal da Apify.
 *
 * `category` é só uma etiqueta livre (é o que a migration 0014 diz: "texto e
 * não enum, o nicho muda mais rápido que o schema").
 */
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { TrackedProfile } from '@/types/db'

export interface DefaultProfile {
  /** Sem "@": é o que a Apify espera e o que evita o mesmo perfil duas vezes. */
  username: string
  category: string
}

export const DEFAULT_TRACKED_PROFILES: DefaultProfile[] = [
  { username: 'odanilogato', category: 'br-ia-negocios' },
  { username: 'thaismartan', category: 'br-ia-negocios' },
  { username: 'guilhermekarv', category: 'br-ia-negocios' },
  { username: 'tiagolemosx', category: 'br-ia-negocios' },
  { username: 'pompeu.ia', category: 'br-ia-negocios' },
  { username: 'fabianocarvalhojr', category: 'br-ia-negocios' },
  { username: 'marceloatavora', category: 'br-ia-negocios' },
  { username: 'dfolloni', category: 'br-ia-negocios' },
  { username: 'uandrey', category: 'br-ia-negocios' },
  { username: 'izabela.anholett', category: 'br-ia-negocios' },
  { username: 'gabriel.adamuchi', category: 'br-ia-negocios' },
  { username: 'brunobelissimo.ai', category: 'br-ia-negocios' },
  { username: 'rafa.grandi', category: 'br-ia-negocios' },
  { username: 'becaalcantara.oficial', category: 'br-ia-negocios' },
  { username: 'molise.ia', category: 'br-ia-negocios' },
  { username: 'eusoutwins', category: 'infoproduto-ia' },
  { username: 'bubows.ia', category: 'infoproduto-ia' },
  { username: 'lucasrochaator', category: 'infoproduto-ia' },
  { username: 'milamarksonofficial', category: 'infoproduto-ia' },
  { username: 'matheusfonseca.ia', category: 'infoproduto-ia' },
  { username: 'brandsdecoded__', category: 'infoproduto-ia' },
  { username: 'matheus.apps', category: 'vibe-coding' },
  { username: 'noevarner.ai', category: 'vibe-coding' },
  { username: 'jp.asv', category: 'vibe-coding' },
  { username: 'tatagoncalvesof', category: 'vibe-coding' },
  { username: 'iron.coding', category: 'vibe-coding' },
  { username: 'brodyautomates', category: 'vibe-coding' },
  { username: 'daniellimae', category: 'vibe-coding' },
  { username: 'brunokalil_', category: 'vibe-coding' },
  { username: 'maxcarrau.ia', category: 'vibe-coding' },
  { username: 'guivilasboas.ia', category: 'vibe-coding' },
]

export interface ImportProfilesResult {
  /** Quantos perfis a lista tem. */
  total: number
  /** Quantos entraram agora. O resto já estava lá. */
  inserted: number
  error?: string
}

/**
 * Insere a lista inicial em `tracked_profiles`.
 *
 * É uma Server Action e não um seed SQL de propósito. O seed precisaria de um
 * `account_id` colado à mão — e `account_id` só existe depois que o dono
 * conecta o Instagram, então o arquivo nasceria com um UUID que ninguém sabe
 * na hora de rodar a migration. Além disso a migration 0014 é explícita: "a
 * raspagem dispara por botão na tela, então a lista precisa ser editável pelo
 * painel". Lista que entra pelo painel e sai pelo painel é uma coisa só.
 *
 * `ignoreDuplicates` é o que torna o botão seguro de apertar duas vezes: perfil
 * que já existe fica INTACTO. Reimportar não ressuscita perfil que o dono
 * desativou nem zera `median_plays` / `last_scraped_at` — perder a mediana
 * apagaria a régua do outlier de todo o acervo daquele perfil.
 */
export async function importDefaultTrackedProfiles(
  accountId: string,
): Promise<ImportProfilesResult> {
  const rows = DEFAULT_TRACKED_PROFILES.map((profile) => ({
    account_id: accountId,
    username: profile.username,
    category: profile.category,
    is_active: true,
  }))

  const { data, error } = await supabaseAdmin
    .from('tracked_profiles')
    .upsert(rows, { onConflict: 'account_id,username', ignoreDuplicates: true })
    .select('id')

  if (error) {
    return { total: rows.length, inserted: 0, error: error.message }
  }

  return { total: rows.length, inserted: data?.length ?? 0 }
}

export type ActiveProfile = Pick<
  TrackedProfile,
  'id' | 'username' | 'category' | 'last_scraped_at'
>

/**
 * Perfis ativos da conta, do menos raspado para o mais raspado.
 *
 * A ordem É o cursor da raspagem: sem tabela de estado, "quem falta nesta
 * rodada" é simplesmente quem tem `last_scraped_at` mais velho. `nulls first`
 * põe o perfil recém-importado na frente, que é o que o dono espera ver
 * primeiro depois de importar a lista.
 */
export async function loadActiveProfiles(accountId: string): Promise<ActiveProfile[]> {
  const { data, error } = await supabaseAdmin
    .from('tracked_profiles')
    .select('id, username, category, last_scraped_at')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('last_scraped_at', { ascending: true, nullsFirst: true })

  if (error) throw new Error(`não foi possível ler os perfis acompanhados: ${error.message}`)

  return (data ?? []) as ActiveProfile[]
}
