import { describe, expect, it } from 'vitest'

import {
  SCHEDULE_JITTER_MS,
  describeAspectProblem,
  isAspectAccepted,
  isImageType,
  isVideoType,
  jitteredScheduleAt,
} from '@/lib/publications/rules'

describe('jitteredScheduleAt', () => {
  it('nunca antecipa e nunca passa de 7 minutos', () => {
    const base = new Date('2026-09-01T09:00:00.000Z')
    expect(jitteredScheduleAt(base, () => 0).getTime()).toBe(base.getTime())
    expect(jitteredScheduleAt(base, () => 0.999999).getTime()).toBeLessThan(base.getTime() + SCHEDULE_JITTER_MS)
    expect(jitteredScheduleAt(base, () => 0.5).getTime()).toBe(base.getTime() + SCHEDULE_JITTER_MS / 2)
  })
})

describe('isAspectAccepted', () => {
  it('aceita os formatos canônicos do feed', () => {
    expect(isAspectAccepted(1080, 1350)).toBe(true) // 4:5
    expect(isAspectAccepted(1080, 1080)).toBe(true) // 1:1
    expect(isAspectAccepted(1080, 566)).toBe(true) // 1.91:1
  })

  it('tolera um pixel de export sem recusar', () => {
    expect(isAspectAccepted(1079, 1350)).toBe(true)
  })

  it('recusa story vertical e panorama', () => {
    expect(isAspectAccepted(1080, 1920)).toBe(false)
    expect(isAspectAccepted(2000, 800)).toBe(false)
    expect(isAspectAccepted(0, 100)).toBe(false)
  })

  it('explica o problema na direção certa', () => {
    expect(describeAspectProblem(1080, 1920)).toContain('alta demais')
    expect(describeAspectProblem(2000, 800)).toContain('larga demais')
  })
})

describe('tipos aceitos', () => {
  it('imagem é jpeg ou png; vídeo é mp4 ou mov', () => {
    expect(isImageType('image/jpeg')).toBe(true)
    expect(isImageType('image/png')).toBe(true)
    expect(isImageType('image/gif')).toBe(false)
    expect(isVideoType('video/mp4')).toBe(true)
    expect(isVideoType('video/webm')).toBe(false)
  })
})
