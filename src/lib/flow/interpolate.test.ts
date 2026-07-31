import { describe, expect, it } from 'vitest'

import { interpolate } from '@/lib/flow/engine'
import type { FlowContext } from '@/lib/flow/types'
import type { Contact } from '@/types/db'

/**
 * `{{contact_id}}` no link é o que liga a pessoa da DM à conversão na página.
 * Se parar de resolver, o link sai literal, a página não sabe quem converteu
 * e o resgate vai para quem já entrou no grupo.
 */
function contact(partial: Partial<Contact> = {}): Contact {
  return {
    id: 'c0ffee00-0000-4000-8000-000000000001',
    account_id: 'a',
    ig_user_id: 'ig1',
    username: 'fulano',
    name: 'Fulano da Silva',
    tags: [],
    fields: {},
    last_inbound_at: null,
    subscribed: true,
    automation_paused: false,
    last_message_at: null,
    unread_count: 0,
    source_type: null,
    source_id: null,
    source_at: null,
    inbox_status: 'open',
    snooze_until: null,
    notes: null,
    created_at: '2026-07-31T00:00:00Z',
    updated_at: '2026-07-31T00:00:00Z',
    ...partial,
  }
}

const ctx = (vars: Record<string, string> = {}): FlowContext => ({ vars })

describe('interpolate', () => {
  it('resolve {{contact_id}} — o elo com a página de conversão', () => {
    const url = interpolate('https://pagina.com/mapa?c={{contact_id}}', contact(), ctx())
    expect(url).toBe('https://pagina.com/mapa?c=c0ffee00-0000-4000-8000-000000000001')
  })

  it('usa o nome, e cai para o @usuário quando não há nome', () => {
    expect(interpolate('Oi {{nome}}!', contact(), ctx())).toBe('Oi Fulano da Silva!')
    expect(interpolate('Oi {{nome}}!', contact({ name: null }), ctx())).toBe('Oi fulano!')
  })

  it('resolve variáveis coletadas no fluxo', () => {
    expect(interpolate('email: {{email}}', contact(), ctx({ email: 'a@b.com' }))).toBe(
      'email: a@b.com',
    )
  })

  it('variável desconhecida vira vazio, nunca o texto cru', () => {
    expect(interpolate('x{{nao_existe}}y', contact(), ctx())).toBe('xy')
  })

  it('tolera espaços dentro das chaves', () => {
    expect(interpolate('Oi {{  nome  }}', contact(), ctx())).toBe('Oi Fulano da Silva')
  })
})
