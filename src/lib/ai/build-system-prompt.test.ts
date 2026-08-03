import { describe, expect, it } from 'vitest'

import {
  buildCtaBlock,
  buildDeliverySystemPrompt,
  buildSystemPrompt,
  parseNamedMechanisms,
} from '@/lib/ai/build-system-prompt'
import type { Persona } from '@/types/db'

/**
 * O coração do porte: o system prompt tem que sair das LINHAS da tabela.
 *
 * Se um dia alguém escrever texto de nicho aqui dentro do código, o gerador
 * para de servir para outro nicho e ninguém percebe — o roteiro continua
 * saindo, só que errado. Por isso metade destes casos afirma o que NÃO pode
 * aparecer no prompt.
 */

function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'p1',
    account_id: 'a1',
    name: 'Dona Vera',
    niche: 'confeitaria caseira',
    voice_prompt: 'Fala como quem ensina na cozinha, sem termo técnico.',
    forbidden_rules: ['nunca prometer lucro rápido', 'nunca falar mal de marca'],
    format_rules: 'Sempre abrir mostrando o doce pronto.',
    named_mechanisms: [{ name: 'Ponto da Vera', desc: 'o ponto exato do brigadeiro' }],
    recording_guidance: 'Bancada iluminada, celular na horizontal.',
    headline_formula: 'Como X sem Y1, Y2 e Y3',
    offer: 'Curso Doces que Vendem, R$ 197',
    cta_keyword: 'DOCE',
    is_active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('buildSystemPrompt', () => {
  it('costura todos os campos da persona no prompt', () => {
    const prompt = buildSystemPrompt(persona())

    expect(prompt).toContain('Dona Vera')
    expect(prompt).toContain('confeitaria caseira')
    expect(prompt).toContain('Fala como quem ensina na cozinha, sem termo técnico.')
    expect(prompt).toContain('- nunca prometer lucro rápido')
    expect(prompt).toContain('- nunca falar mal de marca')
    expect(prompt).toContain('Sempre abrir mostrando o doce pronto.')
    expect(prompt).toContain('Como X sem Y1, Y2 e Y3')
    expect(prompt).toContain('Bancada iluminada, celular na horizontal.')
    expect(prompt).toContain('"Ponto da Vera": o ponto exato do brigadeiro')
    expect(prompt).toContain('Curso Doces que Vendem, R$ 197')
  })

  it('não carrega nicho nenhum escrito no código', () => {
    // O projeto de origem tinha uma linha de nicho cravada no prompt: "NÃO
    // transforme todo roteiro em criar app/sistema com IA sem programar". Ela
    // não veio junto — o lugar dela é `personas.forbidden_rules`. Este caso é
    // o que impede alguém de trazê-la de volta sem perceber.
    //
    // "clichê de IA" nas regras de copy é sobre texto que CHEIRA a gerado por
    // modelo, não sobre o nicho de ninguém — por isso a busca é pela frase.
    const prompt = buildSystemPrompt(persona())

    expect(prompt).not.toMatch(/sem programar|criar (app|sistema)|no.?code|com IA\b/i)
  })

  it('troca de nicho trocando a linha, não o código', () => {
    const doces = buildSystemPrompt(persona())
    const marcenaria = buildSystemPrompt(
      persona({ name: 'Tião', niche: 'marcenaria', voice_prompt: 'Fala curto, de oficina.' }),
    )

    expect(marcenaria).toContain('marcenaria')
    expect(marcenaria).toContain('Fala curto, de oficina.')
    expect(marcenaria).not.toContain('confeitaria caseira')
    expect(doces).not.toContain('marcenaria')
  })

  it('avisa quando não há proibição nem mecanismo em vez de deixar buraco', () => {
    const prompt = buildSystemPrompt(persona({ forbidden_rules: [], named_mechanisms: [] }))

    expect(prompt).toContain('(sem regras definidas)')
    expect(prompt).toContain('(nenhum mecanismo nomeado ainda)')
  })

  it('omite a seção de oferta quando a persona não tem oferta', () => {
    expect(buildSystemPrompt(persona({ offer: '' }))).not.toContain('# OFERTA')
    expect(buildSystemPrompt(persona())).toContain('# OFERTA')
  })

  it('inclui os ganchos campeões só quando existem', () => {
    const bloco = '# GANCHOS QUE JÁ ESTOURARAM\n- "olha o ponto"'

    expect(buildSystemPrompt(persona(), bloco)).toContain('olha o ponto')
    expect(buildSystemPrompt(persona(), null)).not.toContain('GANCHOS QUE JÁ ESTOURARAM')
    // String vazia não pode virar uma seção em branco no meio do prompt.
    expect(buildSystemPrompt(persona(), '')).not.toMatch(/\n\n\n/)
  })

  it('mantém as regras de copy, que são de ofício e não de nicho', () => {
    expect(buildSystemPrompt(persona())).toContain('# REGRA DE COPY')
  })
})

describe('parseNamedMechanisms', () => {
  it('lê a lista bem formada', () => {
    expect(parseNamedMechanisms([{ name: 'Ponto da Vera', desc: 'x' }])).toEqual([
      { name: 'Ponto da Vera', desc: 'x' },
    ])
  })

  it('aceita mecanismo sem descrição', () => {
    expect(parseNamedMechanisms([{ name: 'Ponto da Vera' }])).toEqual([
      { name: 'Ponto da Vera', desc: '' },
    ])
  })

  it('devolve lista vazia para jsonb malformado em vez de derrubar a geração', () => {
    expect(parseNamedMechanisms('nada disso')).toEqual([])
    expect(parseNamedMechanisms([{ nome: 'errado' }])).toEqual([])
    expect(parseNamedMechanisms(null)).toEqual([])
  })
})

describe('buildCtaBlock', () => {
  it('usa a palavra-chave da persona — é ela que liga o roteiro à automação', () => {
    expect(buildCtaBlock(persona())).toContain('"DOCE"')
  })

  it('cai numa palavra genérica quando a persona ainda não definiu a dela', () => {
    expect(buildCtaBlock(persona({ cta_keyword: '   ' }))).toContain('"EU QUERO"')
  })
})

/**
 * A trava de fato nasceu de um roteiro real que dizia "Eu testei isso num
 * projeto meu. Antes eu gastava quarenta reais por mês. Agora gasto doze" —
 * sobre um teste que o dono nunca fez (03/08/2026).
 *
 * O teste é contra REGRESSÃO de prompt, que é um tipo de regressão que não
 * quebra build nem tipo: alguém enxuga o system prompt, a regra some, e a
 * única evidência aparece meses depois num vídeo já gravado.
 */
describe('trava contra fato inventado', () => {
  it('proíbe experiência inventada do creator nos DOIS prompts', () => {
    for (const prompt of [buildSystemPrompt(persona()), buildDeliverySystemPrompt(persona())]) {
      expect(prompt).toContain('NUNCA invente experiência do creator')
      expect(prompt).toContain('eu testei')
    }
  })

  it('proíbe número e nome sem fonte, e ensina a marcar a lacuna', () => {
    const prompt = buildSystemPrompt(persona())
    expect(prompt).toContain('NUNCA invente número')
    expect(prompt).toContain('[SEU NÚMERO AQUI]')
  })

  it('manda preservar unidade e condição do número que veio do material', () => {
    // "70x em projetos grandes" virou "70%" sem condição no primeiro roteiro:
    // errar a unidade é tão grave quanto inventar, e passa mais despercebido.
    expect(buildSystemPrompt(persona())).toContain('mesma unidade')
  })

  it('vem DEPOIS da regra de copy — ela é a exceção à especificidade pedida', () => {
    const prompt = buildSystemPrompt(persona())
    expect(prompt.indexOf('# FATO')).toBeGreaterThan(prompt.indexOf('# REGRA DE COPY'))
  })

  it('não proíbe explicar como as coisas funcionam', () => {
    // Trava larga demais produziria roteiro que não afirma nada — e copy que
    // não afirma nada não converte. A regra é contra fato específico sem
    // fonte, não contra conhecimento do nicho.
    expect(buildSystemPrompt(persona())).toContain('conhecimento geral')
  })
})

/**
 * Segunda rodada da trava, 03/08/2026. Com a regra de fato já ligada, o modelo
 * parou de inventar número de resultado — mas escreveu "Eu passei por isso.
 * Salvava vinte Reel por dia", que veio da seção QUEM ESTÁ DO OUTRO LADO da
 * persona (o público consome 50-100 Reels/dia).
 *
 * Converter a descrição do público em biografia do creator é a invenção mais
 * difícil de pegar: soa como a técnica de copy correta ("eu já fui você") e
 * ninguém desconfia de uma frase bem escrita.
 */
describe('trava: público não vira passado do creator', () => {
  it('proíbe transformar a descrição do público em memória pessoal', () => {
    const prompt = buildSystemPrompt(persona())
    expect(prompt).toContain('A descrição do PÚBLICO não é o passado do creator')
  })

  it('oferece a saída — segunda ou terceira pessoa, nunca primeira', () => {
    // Proibir sem dar alternativa faria o modelo perder a identificação, que é
    // o que a copy precisa. A regra tem que ensinar o caminho certo.
    const prompt = buildSystemPrompt(persona())
    expect(prompt).toContain('SEGUNDA pessoa')
  })
})
