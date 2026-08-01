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
  /**
   * Raspagem da biblioteca. Opcional: sem ela a tela funciona e só o botão de
   * raspar recusa — nada mais no produto depende disto.
   */
  APIFY_TOKEN: z.string().min(1).optional(),
  /**
   * Gerador de roteiro. Sem a chave o gerador cai num mock determinístico e a
   * tela continua funcionando — foi assim que o projeto de origem permitiu
   * demonstrar sem gastar crédito, e o padrão foi mantido.
   *
   * ATENÇÃO: estas três estão declaradas aqui como DOCUMENTAÇÃO e validação,
   * mas o código de IA e o da raspagem leem `process.env` direto. O motivo é
   * o Proxy `env`: ele valida o schema inteiro no primeiro acesso e estoura
   * sem as variáveis do Instagram e do Supabase — o que mataria o caminho do
   * mock em teste e em máquina sem `.env`. Declarar aqui mantém a lista
   * oficial honesta sem acoplar o opcional ao obrigatório.
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(),
  /** Teto de respostas públicas no MESMO post por hora. DM não tem esse limite. */
  PUBLIC_REPLY_PER_POST_CAP: z.coerce.number().int().positive().default(8),
  /** Protege POST /api/conversao. Sem ela, a rota recusa tudo. */
  CONVERSION_SECRET: z.string().min(16).optional(),
  /**
   * Assina o `?c=<token>` do link de entrega (`/e/[slug]`) — segredo próprio,
   * não reaproveita `PANEL_PASSWORD`: são superfícies diferentes, uma
   * autentica o dono, a outra só marca quem abriu um link público.
   *
   * Declarada aqui como documentação e validação, mas `src/lib/delivery/token.ts`
   * recebe o segredo por parâmetro em vez de ler `env.DELIVERY_TOKEN_SECRET` —
   * mesmo motivo do bloco da Anthropic acima: o `env` Proxy valida o schema
   * INTEIRO no primeiro acesso, o que quebraria o teste do token e a página
   * pública em máquina sem as variáveis do Instagram. Sem o segredo, token
   * nenhum valida — a página serve o conteúdo do mesmo jeito, só sem saber
   * quem abriu (ver Fase 3 do card 01: token ausente não bloqueia).
   */
  DELIVERY_TOKEN_SECRET: z.string().min(16).optional(),
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
    APIFY_TOKEN: process.env.APIFY_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    // Estava fora da lista: o schema tem `.default(8)`, então o valor era
    // SEMPRE 8 e definir a variável na Vercel não surtia efeito nenhum.
    // Configuração que mente em silêncio é pior que configuração inexistente.
    PUBLIC_REPLY_PER_POST_CAP: process.env.PUBLIC_REPLY_PER_POST_CAP,
    CONVERSION_SECRET: process.env.CONVERSION_SECRET,
    DELIVERY_TOKEN_SECRET: process.env.DELIVERY_TOKEN_SECRET,
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
