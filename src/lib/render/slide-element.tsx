import type { ReactElement } from 'react'

import type { CarouselSlide } from '@/lib/ai/schemas'
import { charLength, truncateChars } from '@/lib/flow/types'
import { QUANTIA, type Palette } from '@/lib/render/palette'

/**
 * A árvore de um slide, em JSX puro — o que `render-slide.ts` (fase 2) passa
 * pro `ImageResponse`. Função pura de propósito: satori não roda no vitest
 * (precisa do runtime Node completo pra rasterizar), então o que dá pra testar
 * aqui é a DECISÃO — o que aparece em cada tipo de slide — não o pixel.
 *
 * Só flexbox: satori não tem `display: grid`. Todo tamanho é NÚMERO (px),
 * nunca `em`/`rem` — unidade relativa depende de um `font-size` herdado que o
 * satori nem sempre resolve igual ao browser.
 */

/**
 * O que muda por render: o handle que a capa mostra, a palavra que o slide de
 * CTA precisa garantir visível — ainda que o texto do modelo não repita ela do
 * jeito esperado — e, desde a migration 0023, a paleta da conta. Sem paleta,
 * o padrão QUANTIA: todo slide continua saindo como antes.
 */
export interface Brand {
  /** Sem o `@` — quem chama decide o prefixo. */
  handle: string
  ctaKeyword: string
  /** Ausente = QUANTIA (`palette.ts`). */
  palette?: Palette
  /**
   * Arte de fundo da CAPA, como data URI — o dono sobe (gerada fora, ex.
   * skill de imagem do Codex); o render põe o degradê de contraste e o
   * gancho por cima. Texto continua nosso: modelo de imagem erra grafia.
   */
  coverBackgroundDataUri?: string
}

/**
 * Nomes de família usados nos estilos abaixo — os MESMOS nomes que
 * `render-slide.ts` registra em `fonts` no `ImageResponse`. Fonte única de
 * verdade: mudar um lado sem o outro faz o satori cair pra fonte de sistema,
 * em silêncio (sem erro, só a página final não bate com a marca).
 */
export const FONT_FAMILY = {
  /** Archivo SemiExpanded Bold — o que a marca DIZ, em destaque. */
  title: 'Quantia Title',
  /** IBM Plex Sans Regular — o que a marca DIZ, em corpo de texto. */
  body: 'Quantia Body',
  /** IBM Plex Mono Medium — o que é DADO/rótulo: handle, paginação, palavra-chave. */
  label: 'Quantia Label',
} as const

export const SLIDE_WIDTH = 1080
export const SLIDE_HEIGHT = 1350
const PADDING = 88

/**
 * O rótulo mono, caixa alta, com entreletra — "o ativo tipográfico da marca"
 * (manual, seção 05). Usado pro handle da capa e pra paginação do body.
 */
function label(text: string, palette: Palette): ReactElement {
  return (
    <span
      style={{
        display: 'flex',
        fontFamily: FONT_FAMILY.label,
        fontSize: 28,
        color: palette.ruler,
        textTransform: 'uppercase',
        letterSpacing: 3,
      }}
    >
      {text}
    </span>
  )
}

function title(text: string, fontSize: number, palette: Palette): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: FONT_FAMILY.title,
        fontSize,
        lineHeight: 1.08,
        color: palette.ink,
      }}
    >
      {text}
    </div>
  )
}

function body(text: string, palette: Palette): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        marginTop: 36,
        fontFamily: FONT_FAMILY.body,
        fontSize: 40,
        lineHeight: 1.4,
        color: palette.ink,
      }}
    >
      {text}
    </div>
  )
}

/** `n/N` — nunca no primeiro slide (ali é o handle, não paginação). */
function pageLabel(index: number, total: number, palette: Palette): ReactElement {
  const current = String(index + 1).padStart(2, '0')
  const of = String(total).padStart(2, '0')
  return label(`${current} / ${of}`, palette)
}

/**
 * Teto de segurança pro texto dentro do selo — `persona.cta_keyword` não tem
 * limite de tamanho em lugar nenhum do banco (é campo de OUTRO card). Sem
 * cerca aqui, uma palavra-chave comprida e sem espaço (não quebra linha)
 * vazaria pra fora da caixa — 18 é o que coube, medido no preview, com o
 * pior caso real ("COMPARTILHAMENTO", 17) ainda dentro da borda.
 */
const MAX_KEYWORD_CHARS = 18

/**
 * O satori não quebra nem encolhe: palavra-chave de 16 letras a 72px vazava
 * da caixa pela direita (medido no preview com `COMPARTILHAMENTO`). O corpo
 * desce conforme o comprimento — os degraus foram escolhidos para a
 * palavra mais longa que `MAX_KEYWORD_CHARS` deixa passar caber na caixa.
 */
export function ctaKeywordFontSize(length: number): number {
  if (length <= 10) return 72
  if (length <= 13) return 56
  return 44
}

/**
 * A palavra-chave, garantida — não depende de o texto do modelo mencionar
 * ela do jeito certo. O acento é a ÚNICA cor viva do slide, e o manual a
 * reserva para o CTA (regra 60-30-10): não usar em mais nada. Borda reta,
 * sem raio — a Nota de Auditoria (seção 08) reprova qualquer border-radius.
 */
function ctaBadge(keyword: string, palette: Palette): ReactElement {
  const upper = keyword.toUpperCase()
  const safe = charLength(upper) > MAX_KEYWORD_CHARS ? truncateChars(upper, MAX_KEYWORD_CHARS) : upper

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: 48,
        padding: 32,
        border: `2px solid ${palette.ink}`,
      }}
    >
      {label(palette.ctaLabel, palette)}
      <span
        style={{
          display: 'flex',
          marginTop: 8,
          fontFamily: FONT_FAMILY.title,
          fontSize: ctaKeywordFontSize(charLength(safe)),
          color: palette.accent,
        }}
      >
        {safe}
      </span>
    </div>
  )
}

/**
 * Lista numerada: o índice em mono (o "ativo tipográfico" da marca) e o item
 * em corpo. Item de 80 caracteres quebra em duas linhas — por isso o índice
 * alinha no TOPO do item, não na baseline (que o satori cravava na última
 * linha, medido no preview). Índice em régua, não no acento: o manual reserva
 * o acento para o CTA, regra 60-30-10.
 */
function listItems(items: readonly string[], palette: Palette): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
      {items.map((item, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 28, marginTop: index === 0 ? 0 : 30 }}>
          <span style={{ display: 'flex', fontFamily: FONT_FAMILY.label, fontSize: 30, marginTop: 8, color: palette.ruler }}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span style={{ display: 'flex', flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 38, lineHeight: 1.35, color: palette.ink }}>
            {item}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * O dado gigante do layout "numero". Sem shrink-to-fit no satori, o corpo
 * desce por comprimento — mesmo mecanismo do `ctaKeywordFontSize`, degraus
 * medidos no preview com o teto do schema (12 caracteres).
 */
export function statFontSize(length: number): number {
  if (length <= 4) return 240
  if (length <= 8) return 160
  return 110
}

function statNumber(text: string, palette: Palette): ReactElement {
  return (
    <div style={{ display: 'flex', fontFamily: FONT_FAMILY.title, fontSize: statFontSize(charLength(text)), lineHeight: 1, color: palette.ink }}>
      {text}
    </div>
  )
}

/** A afirmação sozinha, com a régua da marca à esquerda — é citação de si mesmo, não parágrafo. */
function statement(text: string, palette: Palette): ReactElement {
  return (
    <div style={{ display: 'flex', borderLeft: `6px solid ${palette.ink}`, paddingLeft: 44 }}>
      <div style={{ display: 'flex', fontFamily: FONT_FAMILY.title, fontSize: 84, lineHeight: 1.15, color: palette.ink }}>
        {text}
      </div>
    </div>
  )
}

/**
 * Tamanho do título: a capa é o gancho, carrega mais peso que o resto.
 * Calibrado contra `scripts/render-preview.mts` com o texto MAIS LONGO que o
 * schema permite (60 caracteres) — ainda sobra respiro embaixo mesmo no pior
 * caso, o que é o resultado certo: sem shrink-to-fit, o tamanho tem que caber
 * no teto, não preencher o slide médio.
 */
function titleSize(kind: CarouselSlide['kind']): number {
  return kind === 'cover' ? 104 : 68
}

/**
 * A capa com arte: fundo full-bleed, degradê de contraste de baixo pra cima
 * (o gancho senta embaixo) e o texto na cor do PAPEL — sobre foto, é o papel
 * que contrasta, não a tinta. O degradê usa preto fixo, não `palette.ink`:
 * contraste sobre foto é acessibilidade, não identidade.
 */
function coverWithArt(slide: CarouselSlide, brand: Brand, palette: Palette): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        position: 'relative',
        backgroundColor: palette.paper,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- satori, não DOM */}
      <img
        src={brand.coverBackgroundDataUri}
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.12) 100%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'space-between',
          padding: PADDING,
        }}
      >
        <span style={{ display: 'flex', fontFamily: FONT_FAMILY.label, fontSize: 28, color: palette.paper, textTransform: 'uppercase', letterSpacing: 3, opacity: 0.9 }}>
          {`@${brand.handle}`}
        </span>
        <div style={{ display: 'flex', fontFamily: FONT_FAMILY.title, fontSize: 104, lineHeight: 1.08, color: palette.paper }}>
          {slide.title}
        </div>
      </div>
    </div>
  )
}

export function slideElement(
  slide: CarouselSlide,
  index: number,
  total: number,
  brand: Brand,
): ReactElement {
  const palette = brand.palette ?? QUANTIA
  if (slide.kind === 'cover' && brand.coverBackgroundDataUri) return coverWithArt(slide, brand, palette)
  const header = slide.kind === 'cover' ? label(`@${brand.handle}`, palette) : pageLabel(index, total, palette)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        boxSizing: 'border-box',
        padding: PADDING,
        backgroundColor: palette.paper,
      }}
    >
      <div style={{ display: 'flex' }}>{header}</div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
        }}
      >
        {slide.kind === 'body' && slide.layout === 'frase' ? (
          statement(slide.title, palette)
        ) : slide.kind === 'body' && slide.layout === 'numero' ? (
          statNumber(slide.title, palette)
        ) : (
          title(slide.title, titleSize(slide.kind), palette)
        )}
        {slide.kind === 'body' && slide.layout === 'lista' && slide.items ? listItems(slide.items, palette) : null}
        {slide.body && !(slide.kind === 'body' && slide.layout === 'frase') ? body(slide.body, palette) : null}
        {slide.kind === 'cta' ? ctaBadge(brand.ctaKeyword, palette) : null}
      </div>
    </div>
  )
}
