import type { ReactElement } from 'react'

import { charLength, truncateChars } from '@/lib/flow/types'
import { QUANTIA, type Palette } from '@/lib/render/palette'
import { FONT_FAMILY, SLIDE_HEIGHT, SLIDE_WIDTH } from '@/lib/render/slide-element'

/**
 * O padrão "tweet": a afirmação num card de post de texto, o formato que o
 * feed já aprendeu a ler como opinião — para foto estática única (feature de
 * padrões, 31/08).
 *
 * É o card NA NOSSA MARCA, não um print falso do Twitter: paleta e fontes da
 * conta, raio de 2px (o manual reprova raio maior), sem logotipo de terceiro
 * e sem métrica inventada — likes falsos são exatamente o tipo de fabricação
 * que a casa não faz. O que o formato empresta é a GRAMÁTICA (avatar, nome,
 * handle, texto grande), não a identidade do Twitter.
 */

/** Acima disso não é tweet, é legenda — e o corpo menor já não se lê no feed. */
export const TWEET_TEXT_MAX_CHARS = 560
export const TWEET_NAME_MAX_CHARS = 40

export interface TweetCard {
  name: string
  /** Sem o `@`. */
  handle: string
  text: string
}

/**
 * Degraus por comprimento, como todo texto renderizado aqui: o satori não tem
 * shrink-to-fit, então o teto de caracteres e o degrau são a única cerca.
 */
export function tweetFontSize(length: number): number {
  if (length <= 120) return 64
  if (length <= 280) return 54
  return 44
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

export function tweetElement(card: TweetCard, palette: Palette = QUANTIA): ReactElement {
  const name = truncateChars(card.name, TWEET_NAME_MAX_CHARS)
  const text =
    charLength(card.text) > TWEET_TEXT_MAX_CHARS ? truncateChars(card.text, TWEET_TEXT_MAX_CHARS) : card.text

  return (
    <div
      style={{
        display: 'flex',
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        boxSizing: 'border-box',
        padding: 72,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.paper,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 936,
          padding: 64,
          borderRadius: 2,
          border: `2px solid ${palette.ink}`,
          backgroundColor: palette.paper,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              width: 96,
              height: 96,
              borderRadius: 96,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: palette.ink,
              fontFamily: FONT_FAMILY.title,
              fontSize: 40,
              color: palette.paper,
            }}
          >
            {initials(card.name)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ display: 'flex', fontFamily: FONT_FAMILY.title, fontSize: 40, color: palette.ink }}>
              {name}
            </span>
            <span
              style={{
                display: 'flex',
                marginTop: 4,
                fontFamily: FONT_FAMILY.label,
                fontSize: 28,
                letterSpacing: 2,
                color: palette.ruler,
              }}
            >
              {`@${card.handle}`}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 48,
            fontFamily: FONT_FAMILY.body,
            fontSize: tweetFontSize(charLength(text)),
            lineHeight: 1.35,
            color: palette.ink,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  )
}
