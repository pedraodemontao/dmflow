import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { AnthropicError, generateStructured } from '@/lib/ai/anthropic'

/**
 * O contrato com a Anthropic, exercitado contra um `fetch` simulado.
 *
 * A chamada de verdade já foi validada uma vez à mão; o que estes casos
 * guardam é o que muda em silêncio depois: a ferramenta deixar de ser forçada
 * (aí volta JSON dentro de markdown), a contagem de token deixar de somar as
 * tentativas (aí `scripts.tokens_in` mente sobre o custo) e a retentativa
 * deixar de mandar o erro de volta (aí a segunda tentativa repete a primeira).
 */

const schema = z.object({ titulo: z.string().min(1) })

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function toolUse(input: unknown, tokens = { input_tokens: 10, output_tokens: 5 }) {
  return {
    model: 'claude-sonnet-4-5-20250929',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'entregar', input }],
    usage: tokens,
  }
}

/** Tipar os argumentos é o que deixa `mock.calls[n][1]` ser inspecionável. */
function mockFetch(impl: () => Promise<Response>) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(impl)
}

function call() {
  return generateStructured({
    schema,
    system: 'sistema',
    prompt: 'pedido',
    toolName: 'entregar',
    toolDescription: 'entrega',
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('generateStructured', () => {
  it('exige a chave em vez de tentar a chamada sem ela', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')

    await expect(call()).rejects.toBeInstanceOf(AnthropicError)
  })

  it('força a saída pela ferramenta e manda o schema derivado do Zod', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave')
    const fetchMock = mockFetch(async () => reply(toolUse({ titulo: 'ok' })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await call()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'entregar' })
    expect(body.tools[0].input_schema.properties.titulo).toBeTruthy()
    expect(body.system).toBe('sistema')
    expect(result.output).toEqual({ titulo: 'ok' })
    expect(result.tokensIn).toBe(10)
    expect(result.tokensOut).toBe(5)
  })

  it('manda a chave no cabeçalho que a Anthropic espera', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave')
    const fetchMock = mockFetch(async () => reply(toolUse({ titulo: 'ok' })))
    vi.stubGlobal('fetch', fetchMock)

    await call()

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['x-api-key']).toBe('chave')
    expect(headers['anthropic-version']).toBe('2023-06-01')
  })

  it('devolve o erro de validação ao modelo e soma os tokens das duas tentativas', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave')
    const fetchMock = mockFetch(async () =>
      reply(toolUse({ titulo: 'corrigido' }, { input_tokens: 30, output_tokens: 7 })),
    )
    fetchMock.mockResolvedValueOnce(
      reply(toolUse({ titulo: '' }, { input_tokens: 10, output_tokens: 5 })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await call()

    expect(result.output).toEqual({ titulo: 'corrigido' })
    // Custo real da geração: as duas chamadas, não só a que deu certo.
    expect(result.tokensIn).toBe(40)
    expect(result.tokensOut).toBe(12)

    const retry = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(retry.messages).toHaveLength(3)
    expect(retry.messages[2].content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      is_error: true,
    })
  })

  it('desiste depois da segunda tentativa em vez de queimar crédito em loop', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave')
    const fetchMock = mockFetch(async () => reply(toolUse({ titulo: '' })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(call()).rejects.toBeInstanceOf(AnthropicError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('não retenta erro de HTTP — 401 e 429 não viram resposta válida na segunda', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave')
    const fetchMock = mockFetch(async () => reply({ error: 'nope' }, 401))
    vi.stubGlobal('fetch', fetchMock)

    await expect(call()).rejects.toThrow(/401/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
