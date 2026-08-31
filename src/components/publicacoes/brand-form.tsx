'use client'

import { useState } from 'react'
import { Eye, Save } from 'lucide-react'

import { previewBrand, saveBrand } from '@/app/(app)/publicacoes/marca/actions'
import { Button, Input, Label } from '@/components/ui'
import type { Palette } from '@/lib/render/palette'

/**
 * O formulário da marca. Quatro cores + o rótulo do CTA; a prévia vem do
 * servidor como um slide renderizado de verdade.
 */

const FIELDS: Array<{ key: keyof Omit<Palette, 'ctaLabel'>; label: string; hint: string }> = [
  { key: 'paper', label: 'Fundo', hint: 'o papel do slide' },
  { key: 'ink', label: 'Texto', hint: 'títulos e corpo' },
  { key: 'accent', label: 'Acento', hint: 'só a palavra-chave do CTA' },
  { key: 'ruler', label: 'Rótulos', hint: 'handle, paginação, índices' },
]

export function BrandForm({ palette: initial }: { palette: Palette }) {
  const [palette, setPalette] = useState<Palette>(initial)
  const [preview, setPreview] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const ocupado = etapa !== null

  async function run(action: 'preview' | 'save') {
    setErro(null)
    setSalvo(false)
    setEtapa(action === 'preview' ? 'Renderizando…' : 'Salvando…')
    try {
      const result = action === 'preview' ? await previewBrand(palette) : await saveBrand(palette)
      if (!result.ok) {
        setErro(result.error ?? 'Não deu certo.')
        return
      }
      if (result.previewDataUri) setPreview(result.previewDataUri)
      if (action === 'save') setSalvo(true)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setEtapa(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <Label htmlFor={key}>{label}</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id={key}
                type="color"
                value={palette[key]}
                disabled={ocupado}
                onChange={(e) => setPalette({ ...palette, [key]: e.target.value })}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-sm border border-border bg-surface"
              />
              <Input
                value={palette[key]}
                disabled={ocupado}
                onChange={(e) => setPalette({ ...palette, [key]: e.target.value })}
                className="h-9 font-mono text-[11px] uppercase"
              />
            </div>
            <p className="label mt-1 text-[9px] text-muted">{hint}</p>
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="ctaLabel">Rótulo do CTA</Label>
        <Input
          id="ctaLabel"
          value={palette.ctaLabel}
          disabled={ocupado}
          maxLength={16}
          onChange={(e) => setPalette({ ...palette, ctaLabel: e.target.value })}
          className="mt-1.5 w-48"
        />
        <p className="label mt-1 text-[9px] text-muted">o texto acima da palavra-chave, ex. &ldquo;Comenta&rdquo;</p>
      </div>

      {erro && <p className="text-[11px] text-danger">{erro}</p>}
      {salvo && <p className="text-[11px] text-success">Salvo. O próximo render já sai assim.</p>}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" disabled={ocupado} onClick={() => void run('preview')}>
          <Eye className="size-3.5" />
          {etapa === 'Renderizando…' ? etapa : 'Ver prévia'}
        </Button>
        <Button type="button" disabled={ocupado} onClick={() => void run('save')}>
          <Save className="size-3.5" />
          {etapa === 'Salvando…' ? etapa : 'Salvar'}
        </Button>
      </div>

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- data URI vindo do nosso render
        <img src={preview} alt="Prévia do slide de CTA com a paleta escolhida" className="w-full max-w-sm rounded-sm border border-border" />
      )}
    </div>
  )
}
