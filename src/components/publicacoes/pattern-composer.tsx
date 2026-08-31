'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, Send } from 'lucide-react'

import { cloneStaticText, previewPattern, savePatternPublication } from '@/app/(app)/publicacoes/padrao/actions'
import type { FlowOption } from '@/components/publicacoes/new-publication-form'
import { Button, Input, Label, Select, Textarea } from '@/components/ui'
import { CAPTION_MAX_CHARS } from '@/lib/publications/rules'
import { TWEET_TEXT_MAX_CHARS } from '@/lib/render/tweet-element'

/**
 * O compositor do padrão. Prévia antes de salvar, sempre: o que vai pro feed
 * é o render do servidor, e a decisão de publicar se toma olhando pra ele.
 */

export function PatternComposer({
  defaultName,
  defaultHandle,
  flows,
}: {
  defaultName: string
  defaultHandle: string
  flows: FlowOption[]
}) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [handle, setHandle] = useState(defaultHandle)
  const [text, setText] = useState('')
  const [caption, setCaption] = useState('')
  const [flowId, setFlowId] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  /** O card exatamente como estava na última prévia — salvar exige prévia atual. */
  const [previewedCard, setPreviewedCard] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [cloneMode, setCloneMode] = useState<'modelar' | 'copiar'>('modelar')

  const ocupado = etapa !== null
  const card = { pattern: 'tweet' as const, name, handle, text }
  const cardKey = JSON.stringify(card)
  const desatualizado = previewedCard !== cardKey

  async function clonarDePrint(file: File) {
    setErro(null)
    setEtapa('Lendo o print…')
    try {
      const formData = new FormData()
      formData.append('mode', cloneMode)
      formData.append('file', file)
      const result = await cloneStaticText(formData)
      if (!result.ok || !result.text) {
        setErro(result.error ?? 'Não deu certo.')
        return
      }
      setText(result.text)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setEtapa(null)
    }
  }

  async function gerarPrevia() {
    setErro(null)
    setEtapa('Renderizando…')
    try {
      const result = await previewPattern(card)
      if (!result.ok || !result.previewDataUri) {
        setErro(result.error ?? 'Não deu certo.')
        return
      }
      setPreview(result.previewDataUri)
      setPreviewedCard(cardKey)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setEtapa(null)
    }
  }

  async function salvar(publicarAgora: boolean) {
    if (desatualizado) {
      setErro('Gere a prévia do texto atual antes de salvar.')
      return
    }
    setErro(null)
    setEtapa('Salvando…')
    try {
      const result = await savePatternPublication({
        card,
        caption,
        flowId: flowId || null,
        scheduledAt: publicarAgora ? new Date().toISOString() : null,
      })
      if (!result.ok) {
        setErro(result.error ?? 'Não deu certo.')
        return
      }
      router.push('/publicacoes')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setEtapa(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={name} disabled={ocupado} maxLength={40} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="handle">Handle</Label>
          <Input id="handle" value={handle} disabled={ocupado} maxLength={40} onChange={(e) => setHandle(e.target.value)} className="mt-1.5" />
        </div>
      </div>

      <div>
        <Label htmlFor="text">O texto do card</Label>
        <Textarea
          id="text"
          rows={5}
          value={text}
          disabled={ocupado}
          maxLength={TWEET_TEXT_MAX_CHARS}
          onChange={(e) => setText(e.target.value)}
          placeholder="A afirmação forte. Uma ideia só — é isso que o formato pede."
          className="mt-1.5"
        />
        <p className={`label mt-1 text-[9px] ${text.length > TWEET_TEXT_MAX_CHARS ? 'text-danger' : 'text-muted'}`}>
          {text.length}/{TWEET_TEXT_MAX_CHARS}
        </p>
      </div>

      <div className="rounded-md border border-border bg-surface-2 p-3">
        <Label htmlFor="clone-print">Ou clone de um print</Label>
        <p className="label mt-1 text-[9px] text-muted">
          Suba o print de um post de texto que performou. Modelar reescreve na sua voz; copiar
          mantém o texto — copiar é para conteúdo SEU, de terceiro é plágio.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            id="clone-print"
            type="file"
            accept="image/jpeg,image/png"
            disabled={ocupado}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void clonarDePrint(file)
            }}
          />
          <Button type="button" size="sm" variant={cloneMode === 'modelar' ? 'primary' : 'outline'} disabled={ocupado} onClick={() => setCloneMode('modelar')}>
            Modelar
          </Button>
          <Button type="button" size="sm" variant={cloneMode === 'copiar' ? 'primary' : 'outline'} disabled={ocupado} onClick={() => setCloneMode('copiar')}>
            Copiar
          </Button>
        </div>
      </div>

      <Button type="button" variant="outline" disabled={ocupado || !text.trim()} onClick={() => void gerarPrevia()}>
        <Eye className="size-3.5" />
        {etapa === 'Renderizando…' ? etapa : 'Ver prévia'}
      </Button>

      {erro && <p className="text-[11px] text-danger">{erro}</p>}

      {preview && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI do nosso render */}
          <img src={preview} alt="Prévia do card" className="w-full max-w-sm rounded-sm border border-border" />
          {desatualizado && (
            <p className="text-[10px] text-warning">Você editou depois da prévia — gere de novo antes de salvar.</p>
          )}

          <div>
            <Label htmlFor="caption">Legenda</Label>
            <Textarea id="caption" rows={4} value={caption} disabled={ocupado} onChange={(e) => setCaption(e.target.value)} className="mt-1.5" />
            <p className={`label mt-1 text-[9px] ${caption.length > CAPTION_MAX_CHARS ? 'text-danger' : 'text-muted'}`}>
              {caption.length}/{CAPTION_MAX_CHARS}
            </p>
          </div>

          {flows.length > 0 && (
            <div>
              <Label htmlFor="flow">Automação de comentário</Label>
              <Select id="flow" value={flowId} disabled={ocupado} onChange={(e) => setFlowId(e.target.value)} className="mt-1.5">
                <option value="">Nenhuma</option>
                {flows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="button" disabled={ocupado || desatualizado} onClick={() => void salvar(false)}>
              {etapa === 'Salvando…' ? etapa : 'Salvar rascunho'}
            </Button>
            <Button type="button" variant="ghost" disabled={ocupado || desatualizado} onClick={() => void salvar(true)}>
              <Send className="size-3.5" />
              Publicar agora
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
