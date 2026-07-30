import { z } from 'zod'

const schema = z.object({
  INSTAGRAM_APP_ID: z.string().min(1),
  INSTAGRAM_APP_SECRET: z.string().min(1),
  INSTAGRAM_REDIRECT_URI: z.string().url(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  /** Opcional no schema, mas sem ela o painel fica aberto — o proxy avisa. */
  PANEL_PASSWORD: z.string().min(8).optional(),
  /** Teto de envios por conta por hora (anti-flag da Meta). */
  SEND_HOURLY_CAP: z.coerce.number().int().positive().default(60),
})

type Env = z.infer<typeof schema>

let cached: Env | null = null

function load(): Env {
  const parsed = schema.safeParse({
    INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
    INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
    INSTAGRAM_REDIRECT_URI: process.env.INSTAGRAM_REDIRECT_URI,
    INSTAGRAM_WEBHOOK_VERIFY_TOKEN: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    PANEL_PASSWORD: process.env.PANEL_PASSWORD,
    SEND_HOURLY_CAP: process.env.SEND_HOURLY_CAP,
  })

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Variáveis de ambiente faltando ou inválidas: ${missing}. Veja .env.example.`)
  }

  return parsed.data
}

/** Lazy: só valida no primeiro acesso, para `next build` não quebrar sem .env. */
export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    cached ??= load()
    return cached[key as keyof Env]
  },
})

export function hasEnv(): boolean {
  try {
    load()
    return true
  } catch {
    return false
  }
}
