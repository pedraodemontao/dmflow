import { describe, expect, it } from 'vitest'

import { itemAnalysisSchema } from '@/lib/ai/analyze-item'

/**
 * O analisador não assistiu ao vídeo — não há transcrição nem áudio, e a Apify
 * não devolve nenhum dos dois. Todo o valor dele depende de admitir isso.
 *
 * Estes testes guardam o schema contra a "melhoria" mais tentadora: tornar
 * `hookText` obrigatório porque "toda análise deveria ter um gancho". No dia em
 * que isso acontecer, o modelo passa a escrever ganchos que ninguém falou, e
 * cada roteiro modelado neste item herda a invenção sem rastro.
 */
describe('itemAnalysisSchema', () => {
  const base = {
    hookText: null,
    hookConfidence: 'baixa' as const,
    tema: 'Automação de DM no Instagram',
    promessa: null,
    structure: 'provável gancho + demonstração curta',
    structureConfidence: 'baixa' as const,
    visualFormat: 'provável talking head',
    visualFormatConfidence: 'baixa' as const,
    reacaoDoPublico: null,
    ctaTipo: 'comentario_palavra' as const,
    ctaPalavra: 'TOKEN',
    porQueFuncionou: 'Promessa concreta com barreira de entrada baixa',
  }

  it('aceita gancho NULO — é a resposta certa quando a legenda não o contém', () => {
    expect(itemAnalysisSchema.safeParse(base).success).toBe(true)
  })

  it('aceita reação do público nula quando nenhum comentário foi capturado', () => {
    expect(itemAnalysisSchema.safeParse({ ...base, reacaoDoPublico: null }).success).toBe(true)
  })

  it('exige confiança declarada em toda inferência', () => {
    // Inferência sem confiança é indistinguível de fato observado — e é assim
    // que um palpite vira molde de conteúdo real.
    const { structureConfidence, ...semConfianca } = base
    expect(structureConfidence).toBeDefined()
    expect(itemAnalysisSchema.safeParse(semConfianca).success).toBe(false)
  })

  it('recusa confiança fora da escala', () => {
    expect(itemAnalysisSchema.safeParse({ ...base, hookConfidence: 'altíssima' }).success).toBe(
      false,
    )
  })

  it('exige porQueFuncionou — análise que não conclui nada não serviu', () => {
    expect(itemAnalysisSchema.safeParse({ ...base, porQueFuncionou: '' }).success).toBe(false)
  })

  it('reconhece o CTA de comentário, que é o que liga o vídeo à automação', () => {
    const parsed = itemAnalysisSchema.parse(base)
    expect(parsed.ctaTipo).toBe('comentario_palavra')
    expect(parsed.ctaPalavra).toBe('TOKEN')
  })

  it('aceita vídeo sem CTA nenhum', () => {
    const parsed = itemAnalysisSchema.parse({ ...base, ctaTipo: 'nenhum', ctaPalavra: null })
    expect(parsed.ctaPalavra).toBeNull()
  })
})
