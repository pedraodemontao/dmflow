import { describe, expect, it } from 'vitest'

import { checkFlowTexts, checkPublicReply, variantCount } from '@/lib/flow/variation'

describe('variantCount', () => {
  it('texto sem spintax produz uma frase só', () => {
    expect(variantCount('Mandei no seu direct!')).toBe(1)
  })

  it('conta as opções de um grupo', () => {
    expect(variantCount('{Oi|Olá|E aí}!')).toBe(3)
  })

  it('multiplica grupos, porque as combinações se cruzam', () => {
    expect(variantCount('{Oi|Olá} {fulano|amigo}, {tudo bem|beleza}?')).toBe(8)
  })

  it('ignora chave dupla da interpolação de variáveis', () => {
    expect(variantCount('Oi {{nome}}, tudo bem?')).toBe(1)
  })

  it('ignora grupo sem alternativa', () => {
    expect(variantCount('valor {fixo}')).toBe(1)
  })
})

describe('checkPublicReply', () => {
  it('sem resposta pública configurada não há o que exigir', () => {
    expect(checkPublicReply(null)).toBeNull()
    expect(checkPublicReply('   ')).toBeNull()
  })

  it('recusa texto fixo — é o que aparece repetido no mesmo post', () => {
    const issue = checkPublicReply('Mandei no seu direct! 📩')
    expect(issue?.variants).toBe(1)
    expect(issue?.where).toBe('Resposta pública')
  })

  it('recusa com 2 variações: pouco para a superfície mais visível', () => {
    expect(checkPublicReply('{Mandei no direct|Chegou no privado}')).not.toBeNull()
  })

  it('aceita a partir de 3 variações', () => {
    expect(checkPublicReply('{Mandei no direct|Chegou no privado|Te respondi}')).toBeNull()
  })
})

describe('checkFlowTexts', () => {
  const node = (text: string) => [{ id: 'a', label: 'Mensagem', text }]

  it('aponta texto fixo', () => {
    const issues = checkFlowTexts(node('Oi, segue o material'))
    expect(issues).toHaveLength(1)
    expect(issues[0].variants).toBe(1)
  })

  it('aceita a partir de 2 variações', () => {
    expect(checkFlowTexts(node('{Oi|Olá}, segue o material'))).toHaveLength(0)
  })

  it('texto vazio não é problema — bloco ainda em construção', () => {
    expect(checkFlowTexts(node('   '))).toHaveLength(0)
  })

  it('acusa cada bloco problemático separadamente', () => {
    const issues = checkFlowTexts([
      { id: 'a', label: 'Abertura', text: 'Oi!' },
      { id: 'b', label: 'Entrega', text: '{Segue|Tá aqui} o material' },
      { id: 'c', label: 'Fechamento', text: 'Valeu!' },
    ])
    expect(issues.map((i) => i.where)).toEqual(['Abertura', 'Fechamento'])
  })
})
