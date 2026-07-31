import { describe, expect, it } from 'vitest'

import { averagePairwiseSimilarity, similaritySignal, textSimilarity } from '@/lib/risk/similarity'

describe('textSimilarity', () => {
  it('textos idênticos têm similaridade 1', () => {
    expect(textSimilarity('Oi, tudo bem?', 'Oi, tudo bem?')).toBe(1)
  })

  it('ignora caixa e espaço repetido — não é variação de verdade', () => {
    expect(textSimilarity('Oi tudo bem?', '  OI   TUDO BEM?  ')).toBe(1)
  })

  it('textos sem nenhum trigrama em comum têm similaridade 0', () => {
    expect(textSimilarity('abc', 'xyz')).toBe(0)
  })

  it('dois vazios contam como iguais', () => {
    expect(textSimilarity('', '')).toBe(1)
  })

  it('um vazio e um preenchido têm similaridade 0', () => {
    expect(textSimilarity('', 'oi')).toBe(0)
  })

  it('spintax bem variado (poucas letras em comum) fica baixo', () => {
    const value = textSimilarity('Oi! Quer o checklist?', 'Fala! Bora pro material?')
    expect(value).toBeLessThan(0.35)
  })

  it('texto quase idêntico, só a saudação spintax mudou, fica alto', () => {
    const value = textSimilarity(
      'Oi! Aqui está o link do checklist que você pediu, dá uma olhada quando puder.',
      'Olá! Aqui está o link do checklist que você pediu, dá uma olhada quando puder.',
    )
    expect(value).toBeGreaterThan(0.6)
  })

  it('textos com menos de 3 letras ainda comparam (fallback do trigrama)', () => {
    expect(textSimilarity('oi', 'oi')).toBe(1)
    expect(textSimilarity('oi', 'ok')).toBe(0)
  })
})

describe('averagePairwiseSimilarity', () => {
  it('menos de duas mensagens não tem par para comparar', () => {
    expect(averagePairwiseSimilarity([])).toBe(0)
    expect(averagePairwiseSimilarity(['só uma'])).toBe(0)
  })

  it('mensagens idênticas repetidas dão média 1', () => {
    const value = averagePairwiseSimilarity(Array(10).fill('Oi! Confere o link aqui ó'))
    expect(value).toBe(1)
  })

  it('ignora string vazia/em branco na amostra', () => {
    const value = averagePairwiseSimilarity(['Oi! Confere o link aqui ó', '  ', 'Oi! Confere o link aqui ó'])
    expect(value).toBe(1)
  })

  it('mistura de repetido com variado fica no meio do caminho', () => {
    const repetido = averagePairwiseSimilarity(Array(6).fill('Oi! Confere o link aqui ó'))
    const misto = averagePairwiseSimilarity([
      ...Array(3).fill('Oi! Confere o link aqui ó'),
      'Fala! Segue o material que você pediu',
      'Opa! Vou te mandar o arquivo agora',
      'E aí! Toma o link que você pediu',
    ])
    expect(misto).toBeLessThan(repetido)
  })
})

describe('similaritySignal', () => {
  it('menos de 5 envios: verde por falta de amostra, mesmo se idênticos', () => {
    const signal = similaritySignal(Array(4).fill('Oi! Confere o link aqui ó'))
    expect(signal.level).toBe('verde')
    expect(signal.detail).toContain('poucos')
  })

  it('verde: variação alta entre as respostas', () => {
    const signal = similaritySignal([
      'Oi! Quer o checklist? Manda um oi que eu te passo.',
      'Fala! Bora pro material? Chama aqui.',
      'E aí! Topa ver o passo a passo? Responde aqui.',
      'Salve! Interessado no guia? Me chama.',
      'Opa! Quer conferir o conteúdo? Só chamar.',
    ])
    expect(signal.level).toBe('verde')
  })

  it('vermelho: praticamente a mesma mensagem repetida', () => {
    const signal = similaritySignal(Array(40).fill('Oi! Aqui está o link do checklist que você pediu.'))
    expect(signal.level).toBe('vermelho')
    expect(signal.value).toBeGreaterThanOrEqual(0.6)
    expect(signal.detail).toContain('40')
    expect(signal.detail).toMatch(/varie mais/)
  })

  it('amarelo: nem tudo igual, nem tudo variado', () => {
    const signal = similaritySignal([
      'Oi! Aqui está o link do checklist que você pediu, dá uma olhada.',
      'Oi! Aqui está o link do checklist que você pediu, dá uma olhada.',
      'Oi! Aqui está o link do checklist que você pediu, confere.',
      'Fala! Segue o material que você pediu, dá uma conferida aí.',
      'E aí! Toma o conteúdo que combinamos, corre lá.',
    ])
    expect(signal.level).toBe('amarelo')
  })
})
