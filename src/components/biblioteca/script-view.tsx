'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'

import type { Script } from '@/lib/ai/schemas'
import { cn } from '@/lib/utils'

/**
 * O roteiro renderizado, com cada peça copiável.
 *
 * Vive num arquivo próprio porque tem DOIS donos: o modal que acabou de gerar
 * e a aba que lista os já gerados. Duplicar deixaria os dois divergindo no
 * primeiro ajuste — e é a tela em que o dono lê o que vai falar na câmera.
 */

/** Um bloco copiável. Roteiro que não dá para copiar não sai da tela. */
function Bloco({ titulo, children, texto }: { titulo: string; children: React.ReactNode; texto: string }) {
  const [copiado, setCopiado] = useState(false)

  return (
    <div className="rounded-sm border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
        <span className="label text-[9px] text-muted">{titulo}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(texto)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 1500)
          }}
          className={cn(
            'label flex items-center gap-1 text-[9px]',
            copiado ? 'text-accent' : 'text-muted hover:text-foreground',
          )}
        >
          <Copy className="size-3" />
          {copiado ? 'copiado' : 'copiar'}
        </button>
      </div>
      <div className="space-y-2 p-3 text-xs leading-relaxed">{children}</div>
    </div>
  )
}

function Take({ tela, fala }: { tela: string; fala: string }) {
  return (
    <div>
      <p className="label text-[9px] text-accent">na tela: {tela}</p>
      <p className="mt-0.5">{fala}</p>
    </div>
  )
}

export function ScriptView({ script }: { script: Script }) {
  const tudo = [
    script.headline,
    '',
    ...script.beats.map((b) => `[${b.beat}] ${b.tela}\n${b.fala}`),
    '',
    script.caption,
  ].join('\n')

  return (
    <div className="space-y-3">
      <p className="display text-2xl leading-tight">{script.headline}</p>

      <Bloco titulo={`${script.hooks.length} ganchos para testar`} texto={script.hooks.map((h) => h.fala).join('\n')}>
        {script.hooks.map((h, i) => (
          <Take key={i} tela={h.tela} fala={h.fala} />
        ))}
      </Bloco>

      <Bloco titulo="roteiro" texto={tudo}>
        {script.beats.map((b, i) => (
          <div key={i}>
            <p className="label text-[9px] text-muted">{b.beat}</p>
            <Take tela={b.tela} fala={b.fala} />
          </div>
        ))}
      </Bloco>

      <Bloco
        titulo="fecho por plataforma"
        texto={`Instagram: ${script.ctas.instagram.fala}\n\nTikTok: ${script.ctas.tiktok.fala}`}
      >
        <div>
          <p className="label text-[9px] text-muted">Instagram</p>
          <Take tela={script.ctas.instagram.tela} fala={script.ctas.instagram.fala} />
        </div>
        <div>
          <p className="label text-[9px] text-muted">TikTok</p>
          <Take tela={script.ctas.tiktok.tela} fala={script.ctas.tiktok.fala} />
        </div>
      </Bloco>

      <Bloco titulo="legenda" texto={script.caption}>
        <p className="whitespace-pre-line">{script.caption}</p>
      </Bloco>

      <Bloco titulo="como gravar" texto={`${script.format.tipo}\n${script.format.dica}`}>
        <p className="label text-[9px] text-accent">{script.format.tipo}</p>
        <p>{script.format.dica}</p>
      </Bloco>
    </div>
  )
}
