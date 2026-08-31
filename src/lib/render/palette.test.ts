import { describe, expect, it } from 'vitest'

import { QUANTIA, parsePalette, paletteSchema } from '@/lib/render/palette'

describe('parsePalette', () => {
  it('vazio e ausente viram o padrão QUANTIA', () => {
    expect(parsePalette({})).toEqual(QUANTIA)
    expect(parsePalette(null)).toEqual(QUANTIA)
    expect(parsePalette(undefined)).toEqual(QUANTIA)
  })

  it('completa com o padrão o que faltar', () => {
    const parsed = parsePalette({ ink: '#000000' })
    expect(parsed.ink).toBe('#000000')
    expect(parsed.paper).toBe(QUANTIA.paper)
    expect(parsed.ctaLabel).toBe('Comenta')
  })

  it('paleta que não passa no schema cai INTEIRA no padrão — cor meio válida não entra', () => {
    expect(parsePalette({ ink: 'preto' })).toEqual(QUANTIA)
    expect(parsePalette({ ink: '#000' })).toEqual(QUANTIA)
  })
})

describe('paletteSchema', () => {
  it('exige hex de 6 dígitos e rótulo até 16', () => {
    expect(paletteSchema.safeParse({ accent: '#0F4C6B' }).success).toBe(true)
    expect(paletteSchema.safeParse({ accent: 'blue' }).success).toBe(false)
    expect(paletteSchema.safeParse({ ctaLabel: 'um rótulo comprido demais' }).success).toBe(false)
  })
})
