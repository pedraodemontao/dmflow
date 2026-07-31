import { describe, expect, it } from 'vitest'

import { checkFlowTexts, checkPublicReply, variantCount, splitVariations, joinVariations } from '@/lib/flow/variation'

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

describe('splitVariations', () => {
  it('quebra um grupo que cobre o texto inteiro', () => {
    expect(splitVariations('{Mandei no direct|Chegou no privado|Te respondi}')).toEqual([
      'Mandei no direct',
      'Chegou no privado',
      'Te respondi',
    ])
  })

  it('devolve nulo para texto simples', () => {
    expect(splitVariations('Mandei no direct')).toBeNull()
  })

  it('devolve nulo para spintax no meio da frase', () => {
    // Caso avançado: cabe no motor, não cabe numa lista de campos. A tela
    // precisa saber disso para cair no modo bruto em vez de destruir o texto.
    expect(splitVariations('Oi {fulano|amigo}, chegou')).toBeNull()
  })

  it('devolve nulo para grupo de uma opção só', () => {
    expect(splitVariations('{só uma}')).toBeNull()
  })

  it('preserva opção vazia no meio, que o motor entende como "às vezes nada"', () => {
    expect(splitVariations('{a||b}')).toEqual(['a', '', 'b'])
  })
})

describe('joinVariations', () => {
  it('junta em spintax', () => {
    expect(joinVariations(['a', 'b', 'c'])).toBe('{a|b|c}')
  })

  it('uma opção só não vira grupo', () => {
    // `{a}` sairia literal para o contato, com as chaves e tudo.
    expect(joinVariations(['só uma'])).toBe('só uma')
  })

  it('descarta campo vazio e espaço em volta', () => {
    expect(joinVariations(['  a  ', '', '  b'])).toBe('{a|b}')
  })

  it('lista vazia vira texto vazio', () => {
    expect(joinVariations(['', '  '])).toBe('')
  })

  it('ida e volta preserva o conteúdo', () => {
    const original = ['Mandei no direct 📩', 'Chegou no privado ✨', 'Te respondi 😉']
    expect(splitVariations(joinVariations(original))).toEqual(original)
  })
})

describe('variação com variável interpolada', () => {
  // No envio a interpolação roda ANTES do spin, então `{Oi {{nome}}!|E aí
  // {{nome}}!}` funciona de verdade. O validador é que olhava o template cru,
  // via as chaves internas e recusava — rejeitava texto que funciona.
  const comNome = '{Oi {{nome}}, tudo bem?|E aí {{nome}}, beleza?}'

  it('conta as versões mesmo com {{nome}} dentro do grupo', () => {
    expect(variantCount(comNome)).toBe(2)
  })

  it('quebra em campos preservando a variável intacta', () => {
    expect(splitVariations(comNome)).toEqual([
      'Oi {{nome}}, tudo bem?',
      'E aí {{nome}}, beleza?',
    ])
  })

  it('ida e volta não corrompe a variável', () => {
    expect(joinVariations(splitVariations(comNome)!)).toBe(comNome)
  })

  it('o estilo de grupos no meio da frase continua multiplicando', () => {
    expect(variantCount('{Oi|E aí} {{nome}}! {Vi seu comentário|Reparei no seu comentário}')).toBe(4)
  })

  it('texto só com variável continua sendo uma versão só', () => {
    expect(variantCount('Oi {{nome}}')).toBe(1)
  })
})
