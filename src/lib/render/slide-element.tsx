import type { ReactElement } from 'react'

import type { CarouselSlide } from '@/lib/ai/schemas'
import { charLength, truncateChars } from '@/lib/flow/types'

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
 * O que muda por render, não a paleta (fixa, QUANTIA sempre): o handle que a
 * capa mostra e a palavra que o slide de CTA precisa garantir visível — ainda
 * que o texto do modelo não repita ela do jeito esperado.
 */
export interface Brand {
  /** Sem o `@` — quem chama decide o prefixo. */
  handle: string
  ctaKeyword: string
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

/** Paleta QUANTIA (`docs/marca/quantia-manual.md`, seção 04) — não é por persona. */
const COLOR = {
  paper: '#F2F0E9',
  ink: '#14181B',
  blue: '#0F4C6B',
  ruler: '#8A8476',
} as const

export const SLIDE_WIDTH = 1080
export const SLIDE_HEIGHT = 1350
const PADDING = 88

/**
 * O rótulo mono, caixa alta, com entreletra — "o ativo tipográfico da marca"
 * (manual, seção 05). Usado pro handle da capa e pra paginação do body.
 */
function label(text: string): ReactElement {
  return (
    <span
      style={{
        display: 'flex',
        fontFamily: FONT_FAMILY.label,
        fontSize: 28,
        color: COLOR.ruler,
        textTransform: 'uppercase',
        letterSpacing: 3,
      }}
    >
      {text}
    </span>
  )
}

function title(text: string, fontSize: number): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: FONT_FAMILY.title,
        fontSize,
        lineHeight: 1.08,
        color: COLOR.ink,
      }}
    >
      {text}
    </div>
  )
}

function body(text: string): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        marginTop: 36,
        fontFamily: FONT_FAMILY.body,
        fontSize: 40,
        lineHeight: 1.4,
        color: COLOR.ink,
      }}
    >
      {text}
    </div>
  )
}

/** `n/N` — nunca no primeiro slide (ali é o handle, não paginação). */
function pageLabel(index: number, total: number): ReactElement {
  const current = String(index + 1).padStart(2, '0')
  const of = String(total).padStart(2, '0')
  return label(`${current} / ${of}`)
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
 * A palavra-chave, garantida — não depende de o texto do modelo mencionar
 * ela do jeito certo. Azul-Aferição é a ÚNICA cor de acento da marca, e o
 * manual reserva ela para CTA/saldo positivo (regra 60-30-10): não usar em
 * mais nada do slide. Borda reta, sem raio — a Nota de Auditoria (seção 08)
 * reprova qualquer `border-radius`.
 */
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

function ctaBadge(keyword: string): ReactElement {
  const upper = keyword.toUpperCase()
  const safe = charLength(upper) > MAX_KEYWORD_CHARS ? truncateChars(upper, MAX_KEYWORD_CHARS) : upper

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: 48,
        padding: 32,
        border: `2px solid ${COLOR.ink}`,
      }}
    >
      {label('Comenta')}
      <span
        style={{
          display: 'flex',
          marginTop: 8,
          fontFamily: FONT_FAMILY.title,
          fontSize: ctaKeywordFontSize(charLength(safe)),
          color: COLOR.blue,
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
 * linha, medido no preview). Índice em régua, não em azul: o manual reserva
 * o azul para o CTA, regra 60-30-10.
 */
function listItems(items: readonly string[]): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
      {items.map((item, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 28, marginTop: index === 0 ? 0 : 30 }}>
          <span style={{ display: 'flex', fontFamily: FONT_FAMILY.label, fontSize: 30, marginTop: 8, color: COLOR.ruler }}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span style={{ display: 'flex', flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 38, lineHeight: 1.35, color: COLOR.ink }}>
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

function statNumber(text: string): ReactElement {
  return (
    <div style={{ display: 'flex', fontFamily: FONT_FAMILY.title, fontSize: statFontSize(charLength(text)), lineHeight: 1, color: COLOR.ink }}>
      {text}
    </div>
  )
}

/** A afirmação sozinha, com a régua da marca à esquerda — é citação de si mesmo, não parágrafo. */
function statement(text: string): ReactElement {
  return (
    <div style={{ display: 'flex', borderLeft: `6px solid ${COLOR.ink}`, paddingLeft: 44 }}>
      <div style={{ display: 'flex', fontFamily: FONT_FAMILY.title, fontSize: 84, lineHeight: 1.15, color: COLOR.ink }}>
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

export function slideElement(
  slide: CarouselSlide,
  index: number,
  total: number,
  brand: Brand,
): ReactElement {
  const header = slide.kind === 'cover' ? label(`@${brand.handle}`) : pageLabel(index, total)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        boxSizing: 'border-box',
        padding: PADDING,
        backgroundColor: COLOR.paper,
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
          statement(slide.title)
        ) : slide.kind === 'body' && slide.layout === 'numero' ? (
          statNumber(slide.title)
        ) : (
          title(slide.title, titleSize(slide.kind))
        )}
        {slide.kind === 'body' && slide.layout === 'lista' && slide.items ? listItems(slide.items) : null}
        {slide.body && !(slide.kind === 'body' && slide.layout === 'frase') ? body(slide.body) : null}
        {slide.kind === 'cta' ? ctaBadge(brand.ctaKeyword) : null}
      </div>
    </div>
  )
}
