/**
 * Regras puras da publicação — o que a tela valida antes de gravar e o que o
 * agendamento faz com o horário escolhido. Puro para ser testado sem banco.
 */

/** Proporções que a Meta aceita para imagem no feed: de 4:5 (retrato) a 1.91:1 (paisagem). */
export const MIN_ASPECT = 4 / 5
export const MAX_ASPECT = 1.91

/**
 * Story é outra moldura: 9:16. A Meta aceita variações e corta/enquadra o
 * resto — a cerca aqui é contra o engano óbvio (foto de feed num story),
 * não contra meio por cento de export.
 */
export const STORY_ASPECT = 9 / 16

/** Imagem: 8 MB é o teto documentado da Meta para `image_url`. */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024
/** Vídeo sobe direto para o bucket por URL assinada; este é o nosso teto, não o da Meta. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024

export const IMAGE_TYPES = ['image/jpeg', 'image/png'] as const
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const

/** Legenda de post: limite da própria Meta. */
export const CAPTION_MAX_CHARS = 2200

/**
 * Jitter no agendamento: até 7 minutos depois do horário escolhido.
 *
 * É a mesma camada da blindagem anti-spam do comentário (`process_after`
 * com 8–35s): o que o filtro pune é o padrão — post sempre às 09:00:00 em
 * ponto é assinatura de robô. Aplicado AO AGENDAR, não na drenagem: dormir
 * dentro de uma função de 300s é orçamento jogado fora, e o horário gravado
 * já é o que a lista mostra.
 */
export const SCHEDULE_JITTER_MS = 7 * 60 * 1000

export function jitteredScheduleAt(base: Date, random: () => number = Math.random): Date {
  return new Date(base.getTime() + Math.floor(random() * SCHEDULE_JITTER_MS))
}

export function isStoryAspectAccepted(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false
  const ratio = width / height
  return ratio >= STORY_ASPECT * 0.9 && ratio <= STORY_ASPECT * 1.25
}

export function describeStoryAspectProblem(width: number, height: number): string {
  return `story é vertical 9:16, como 1080×1920 — a imagem veio ${width}×${height}`
}

export function isAspectAccepted(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false
  const ratio = width / height
  // Folga de meio por cento: 1080×1350 dá 0.8 exato, mas um export com um
  // pixel a menos daria 0.799 e seria recusado sem motivo.
  return ratio >= MIN_ASPECT * 0.995 && ratio <= MAX_ASPECT * 1.005
}

export function describeAspectProblem(width: number, height: number): string {
  const ratio = width / height
  if (ratio < MIN_ASPECT) return `imagem alta demais (${width}×${height}); o máximo é 4:5, como 1080×1350`
  return `imagem larga demais (${width}×${height}); o máximo é 1.91:1, como 1080×566`
}

export function isImageType(type: string): type is (typeof IMAGE_TYPES)[number] {
  return (IMAGE_TYPES as readonly string[]).includes(type)
}

export function isVideoType(type: string): type is (typeof VIDEO_TYPES)[number] {
  return (VIDEO_TYPES as readonly string[]).includes(type)
}
