import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

let client: SupabaseClient | null = null

/**
 * Client de service_role: bypassa RLS.
 * Nunca importar em Client Component — só em route handlers e Server Components.
 * Instanciado por Proxy para não exigir env no momento do import (`next build`).
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, key: string | symbol) {
    client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const value = Reflect.get(client, key, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
