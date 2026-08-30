'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  createPublication,
  createSignedVideoUpload,
  uploadPublicationImage,
} from '@/app/(app)/publicacoes/actions'
import { Button, Input, Label, Select, Textarea } from '@/components/ui'
import { CAPTION_MAX_CHARS, isImageType, isVideoType } from '@/lib/publications/rules'
import type { PublicationKind } from '@/types/db'

/**
 * O formulário de nova publicação por upload.
 *
 * O upload acontece ANTES de gravar a linha, um arquivo por vez, para a
 * mensagem de erro apontar o arquivo certo ("a segunda imagem é alta
 * demais") em vez de um "falhou" no fim. Imagem passa pela server action
 * (validação + conversão para JPEG); vídeo vai direto para o bucket por URL
 * assinada, porque 50 MB atravessando o servidor não ganha nada.
 */

export interface FlowOption {
  id: string
  name: string
}

/** `datetime-local` quer `YYYY-MM-DDTHH:mm` no fuso do navegador. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function NewPublicationForm({ flows = [] }: { flows?: FlowOption[] }) {
  const router = useRouter()
  const [kind, setKind] = useState<PublicationKind>('image')
  const [files, setFiles] = useState<File[]>([])
  const [cover, setCover] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [flowId, setFlowId] = useState('')
  const [quando, setQuando] = useState<'agora' | 'depois'>('agora')
  const [quandoLocal, setQuandoLocal] = useState(() => localInputValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [etapa, setEtapa] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const enviando = etapa !== null

  function validar(): string | null {
    if (files.length === 0) return 'Escolha a mídia.'
    if (kind === 'carousel' && (files.length < 2 || files.length > 10)) return 'Carrossel leva de 2 a 10 imagens.'
    if (kind !== 'carousel' && files.length !== 1) return `${kind === 'reel' ? 'Reel' : 'Imagem'} leva um arquivo só.`
    if (kind === 'reel' && !isVideoType(files[0].type)) return 'Reel precisa de um MP4 ou MOV.'
    if (kind !== 'reel' && files.some((f) => !isImageType(f.type))) return 'Só JPEG ou PNG.'
    if (cover && !isImageType(cover.type)) return 'A capa precisa ser JPEG ou PNG.'
    if (caption.length > CAPTION_MAX_CHARS) return `Legenda acima de ${CAPTION_MAX_CHARS} caracteres.`
    if (quando === 'depois' && !quandoLocal) return 'Escolha o horário.'
    return null
  }

  async function subirImagem(file: File, rotulo: string): Promise<string> {
    setEtapa(`Subindo ${rotulo}…`)
    const formData = new FormData()
    formData.append('file', file)
    const result = await uploadPublicationImage(formData)
    if (!result.ok || !result.path) throw new Error(`${rotulo}: ${result.error ?? 'falha ao subir'}`)
    return result.path
  }

  async function subirVideo(file: File): Promise<string> {
    setEtapa('Preparando o upload do vídeo…')
    const signed = await createSignedVideoUpload({ contentType: file.type, sizeBytes: file.size })
    if (!signed.ok || !signed.signedUrl || !signed.path) throw new Error(signed.error ?? 'falha ao preparar o upload')

    setEtapa('Subindo o vídeo…')
    const res = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    })
    if (!res.ok) throw new Error(`upload do vídeo falhou (${res.status})`)
    return signed.path
  }

  async function enviar(comoRascunho: boolean) {
    const problema = validar()
    if (problema) {
      setErro(problema)
      return
    }
    setErro(null)

    try {
      const mediaPaths: string[] = []
      if (kind === 'reel') {
        mediaPaths.push(await subirVideo(files[0]))
      } else {
        for (const [i, file] of files.entries()) {
          mediaPaths.push(await subirImagem(file, files.length > 1 ? `imagem ${i + 1} de ${files.length}` : 'a imagem'))
        }
      }
      const coverPath = kind === 'reel' && cover ? await subirImagem(cover, 'a capa') : null

      setEtapa('Salvando…')
      const scheduledAt = comoRascunho
        ? null
        : quando === 'agora'
          ? new Date().toISOString()
          : new Date(quandoLocal).toISOString()

      const result = await createPublication({
        kind,
        caption,
        mediaPaths,
        coverPath,
        scheduledAt,
        flowId: flowId || null,
      })
      if (!result.ok) throw new Error(result.error ?? 'falha ao salvar')

      router.push('/publicacoes')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
      setEtapa(null)
    }
  }

  const aceita = kind === 'reel' ? 'video/mp4,video/quicktime' : 'image/jpeg,image/png'

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        void enviar(false)
      }}
    >
      <div>
        <Label>Tipo</Label>
        <div className="mt-1.5 flex gap-2">
          {(['image', 'carousel', 'reel'] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={kind === option ? 'primary' : 'outline'}
              disabled={enviando}
              onClick={() => {
                setKind(option)
                setFiles([])
                setCover(null)
              }}
            >
              {option === 'image' ? 'Imagem' : option === 'carousel' ? 'Carrossel' : 'Reel'}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="media">
          {kind === 'carousel' ? 'Imagens (2 a 10, na ordem)' : kind === 'reel' ? 'Vídeo' : 'Imagem'}
        </Label>
        <Input
          id="media"
          type="file"
          accept={aceita}
          multiple={kind === 'carousel'}
          disabled={enviando}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="mt-1.5"
        />
        {files.length > 0 && (
          <p className="label mt-1 text-[9px] text-muted">
            {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'} ·{' '}
            {(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB
          </p>
        )}
      </div>

      {kind === 'reel' && (
        <div>
          <Label htmlFor="cover">Capa (opcional, JPEG ou PNG)</Label>
          <Input
            id="cover"
            type="file"
            accept="image/jpeg,image/png"
            disabled={enviando}
            onChange={(e) => setCover(e.target.files?.[0] ?? null)}
            className="mt-1.5"
          />
        </div>
      )}

      <div>
        <Label htmlFor="caption">Legenda</Label>
        <Textarea
          id="caption"
          rows={6}
          value={caption}
          disabled={enviando}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Legenda do post, com hashtags."
          className="mt-1.5"
        />
        <p className={`label mt-1 text-[9px] ${caption.length > CAPTION_MAX_CHARS ? 'text-danger' : 'text-muted'}`}>
          {caption.length}/{CAPTION_MAX_CHARS}
        </p>
      </div>

      {flows.length > 0 && (
        <div>
          <Label htmlFor="flow">Automação de comentário</Label>
          <Select id="flow" value={flowId} disabled={enviando} onChange={(e) => setFlowId(e.target.value)} className="mt-1.5">
            <option value="">Nenhuma</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </Select>
          <p className="label mt-1 text-[9px] text-muted">
            Ao publicar, o gatilho de comentário dessa automação é clonado para o post novo.
          </p>
        </div>
      )}

      <div>
        <Label>Quando</Label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={quando === 'agora' ? 'primary' : 'outline'} disabled={enviando} onClick={() => setQuando('agora')}>
            Agora
          </Button>
          <Button type="button" size="sm" variant={quando === 'depois' ? 'primary' : 'outline'} disabled={enviando} onClick={() => setQuando('depois')}>
            Agendar
          </Button>
          {quando === 'depois' && (
            <Input
              type="datetime-local"
              value={quandoLocal}
              disabled={enviando}
              onChange={(e) => setQuandoLocal(e.target.value)}
              className="h-8 w-auto text-[11px]"
            />
          )}
        </div>
        <p className="label mt-1 text-[9px] text-muted">
          Sai pelo tick, com até 7 minutos de variação — post sempre em ponto é assinatura de robô.
        </p>
      </div>

      {erro && <p className="text-[11px] text-danger">{erro}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={enviando}>
          {etapa ?? (quando === 'agora' ? 'Publicar agora' : 'Agendar')}
        </Button>
        <Button type="button" variant="ghost" disabled={enviando} onClick={() => void enviar(true)}>
          Salvar rascunho
        </Button>
      </div>
    </form>
  )
}
