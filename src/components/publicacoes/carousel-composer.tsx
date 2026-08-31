'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'

import { createPublication, uploadPublicationImage } from '@/app/(app)/publicacoes/actions'
import { generateAndRenderCarousel, rerenderCarousel } from '@/app/(app)/publicacoes/gerar/actions'
import type { FlowOption } from '@/components/publicacoes/new-publication-form'
import { Badge, Button, Input, Label, Select, Textarea } from '@/components/ui'
import {
  CAROUSEL_CAPTION_MAX_CHARS,
  SLIDE_BODY_MAX_CHARS,
  SLIDE_TITLE_MAX_CHARS,
  type Carousel,
} from '@/lib/ai/schemas'

/**
 * O compositor: pedido → prévia → edição → rascunho.
 *
 * Duas etapas, e a fronteira é o dinheiro: "Gerar" chama o modelo uma vez;
 * tudo depois disso (editar, renderizar de novo, salvar) é grátis. O botão de
 * gerar de novo não existe de propósito — quem quer outro texto ajusta o tema
 * e gera, sabendo que paga.
 */

export interface ComposerSource {
  kind: 'script' | 'item' | 'free'
  id: string | null
  label: string | null
}

interface PillarOption {
  id: string
  name: string
}

interface Draft {
  scriptId: string | null
  renderKey: string
  carousel: Carousel
  paths: string[]
  urls: string[]
  model?: string
  /** Texto de exemplo: a IA não respondeu. Nunca vai para o Instagram. */
  mock: boolean
  /** Os slides como estavam no último render. A legenda fica de fora: ela não entra nas imagens. */
  renderedSlides: string
}

const KIND_LABEL: Record<Carousel['slides'][number]['kind'], string> = {
  cover: 'capa',
  body: 'slide',
  cta: 'fecho',
}

export function CarouselComposer({
  source,
  pillars,
  flows,
}: {
  source: ComposerSource
  pillars: PillarOption[]
  flows: FlowOption[]
}) {
  const router = useRouter()
  const [pillarId, setPillarId] = useState('')
  const [theme, setTheme] = useState('')
  const [flowId, setFlowId] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  /** Caminho da arte de fundo da capa no bucket. O render que sai é sempre o do último `renderizar`. */
  const [coverArt, setCoverArt] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const ocupado = etapa !== null

  async function gerar() {
    setErro(null)
    setAviso(null)
    setEtapa('Escrevendo os slides…')
    try {
      const result = await generateAndRenderCarousel({
        libraryItemId: source.kind === 'item' ? source.id : null,
        scriptId: source.kind === 'script' ? source.id : null,
        pillarId: pillarId || null,
        theme: theme || null,
      })
      if (!result.ok || !result.carousel || !result.renderKey) {
        setErro(result.error ?? 'Não deu certo.')
        return
      }
      setDraft({
        scriptId: result.scriptId ?? null,
        renderKey: result.renderKey,
        carousel: result.carousel,
        paths: result.paths ?? [],
        urls: result.urls ?? [],
        model: result.model,
        mock: result.mock === true,
        renderedSlides: JSON.stringify(result.carousel.slides),
      })
      setAviso(result.warning ?? null)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setEtapa(null)
    }
  }

  async function renderizar(coverPathOverride?: string | null) {
    if (!draft) return
    setErro(null)
    setAviso(null)
    setEtapa('Renderizando…')
    try {
      const result = await rerenderCarousel({
        renderKey: draft.renderKey,
        scriptId: draft.scriptId,
        carousel: draft.carousel,
        coverBackgroundPath: coverPathOverride === undefined ? coverArt : coverPathOverride,
      })
      if (!result.ok || !result.carousel) {
        setErro(result.error ?? 'Não deu certo.')
        return
      }
      setDraft({
        ...draft,
        carousel: result.carousel,
        paths: result.paths ?? [],
        urls: result.urls ?? [],
        renderedSlides: JSON.stringify(result.carousel.slides),
      })
      setAviso(result.warning ?? null)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setEtapa(null)
    }
  }

  async function salvar(publicarAgora: boolean) {
    if (!draft) return
    if (draft.mock) {
      setErro('Isto é texto de exemplo — a IA não respondeu. Não vai para o Instagram.')
      return
    }
    if (draft.paths.length === 0 || JSON.stringify(draft.carousel.slides) !== draft.renderedSlides) {
      setErro('Renderize antes de salvar: as imagens precisam ser as do texto atual.')
      return
    }
    setErro(null)
    setEtapa('Salvando…')
    try {
      const result = await createPublication({
        kind: 'carousel',
        caption: draft.carousel.caption,
        mediaPaths: draft.paths,
        scriptId: draft.scriptId,
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

  /** Sobe a arte e já re-renderiza: arte gravada sem render novo seria capa velha no salvar. */
  async function subirArteDaCapa(file: File) {
    setErro(null)
    setEtapa('Subindo a arte…')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('target', 'feed')
      const result = await uploadPublicationImage(formData)
      if (!result.ok || !result.path) {
        setErro(result.error ?? 'Falha ao subir a arte.')
        return
      }
      setCoverArt(result.path)
      await renderizar(result.path)
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setEtapa(null)
    }
  }

  function editSlide(index: number, patch: Partial<Carousel['slides'][number]>) {
    if (!draft) return
    const slides = draft.carousel.slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide))
    setDraft({ ...draft, carousel: { ...draft.carousel, slides } })
  }

  // Slide editado depois do render: as imagens do bucket não batem com o
  // texto da tela, e salvar levaria as velhas. Só a legenda pode mudar sem
  // render novo — ela não está nas imagens.
  const slidesDesatualizados =
    draft !== null && JSON.stringify(draft.carousel.slides) !== draft.renderedSlides
  const semImagens = draft !== null && draft.paths.length === 0
  const precisaRenderizar = slidesDesatualizados || semImagens
  // Mock publicado na conta real em 30/08 é o motivo desta linha existir.
  const ehMock = draft?.mock === true

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        {source.kind !== 'free' && source.label && (
          <div className="flex items-center gap-2">
            <Badge tone="accent">{source.kind === 'script' ? 'do roteiro' : 'modelado em'}</Badge>
            <p className="truncate text-[11px] text-muted">{source.label}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          {source.kind !== 'script' && pillars.length > 0 && (
            <div>
              <Label htmlFor="pillar">Pilar</Label>
              <Select id="pillar" value={pillarId} disabled={ocupado} onChange={(e) => setPillarId(e.target.value)} className="mt-1.5">
                <option value="">{source.kind === 'item' ? 'O do vídeo' : 'Livre'}</option>
                {pillars.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="theme">Tema ou ângulo (opcional)</Label>
            <Input
              id="theme"
              value={theme}
              disabled={ocupado}
              maxLength={200}
              onChange={(e) => setTheme(e.target.value)}
              placeholder={source.kind === 'script' ? 'Deixe vazio para seguir o roteiro' : 'Ex.: o erro que todo iniciante comete'}
              className="mt-1.5"
            />
          </div>
        </div>

        <Button type="button" disabled={ocupado} onClick={() => void gerar()}>
          <Sparkles className="size-3.5" />
          {etapa && !draft ? etapa : draft ? 'Gerar outro (paga de novo)' : 'Gerar carrossel'}
        </Button>
      </section>

      {erro && <p className="text-[11px] text-danger">{erro}</p>}
      {aviso && <p className="text-[11px] text-warning">{aviso}</p>}

      {draft && (
        <section className="space-y-5">
          {draft.urls.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {draft.urls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- prévia do nosso bucket
                <img key={url} src={url} alt={`slide ${i + 1}`} className="w-full rounded-sm border border-border" />
              ))}
            </div>
          )}

          <div className="rounded-md border border-border bg-surface-2 p-3">
            <Label htmlFor="cover-art">Arte de fundo da capa (opcional)</Label>
            <p className="label mt-1 text-[9px] text-muted">
              Gere a arte fora (ex. skill de imagem) em 4:5, sem texto — o gancho é desenhado por cima, na tipografia da marca.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="cover-art"
                type="file"
                accept="image/jpeg,image/png"
                disabled={ocupado}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void subirArteDaCapa(file)
                }}
              />
              {coverArt && (
                <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => { setCoverArt(null); void renderizar(null) }}>
                  Remover
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {draft.carousel.slides.map((slide, i) => (
              <div key={i} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone={slide.kind === 'body' ? 'neutral' : 'accent'}>{KIND_LABEL[slide.kind]}</Badge>
                  <span className="label text-[9px] text-muted">
                    {i + 1}/{draft.carousel.slides.length}
                  </span>
                </div>
                <Input
                  value={slide.title}
                  disabled={ocupado}
                  maxLength={SLIDE_TITLE_MAX_CHARS}
                  onChange={(e) => editSlide(i, { title: e.target.value })}
                  className="text-sm"
                />
                <p className="label mt-1 text-[9px] text-muted">
                  {slide.title.length}/{SLIDE_TITLE_MAX_CHARS}
                </p>
                <Textarea
                  rows={3}
                  value={slide.body ?? ''}
                  disabled={ocupado}
                  maxLength={SLIDE_BODY_MAX_CHARS}
                  onChange={(e) => editSlide(i, { body: e.target.value || undefined })}
                  placeholder={slide.kind === 'cover' ? 'Capa costuma não precisar de texto de apoio' : ''}
                  className="mt-2"
                />
                <p className="label mt-1 text-[9px] text-muted">
                  {(slide.body ?? '').length}/{SLIDE_BODY_MAX_CHARS}
                </p>
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="caption">Legenda</Label>
            <Textarea
              id="caption"
              rows={6}
              value={draft.carousel.caption}
              disabled={ocupado}
              onChange={(e) => setDraft({ ...draft, carousel: { ...draft.carousel, caption: e.target.value } })}
              className="mt-1.5"
            />
            <p className={`label mt-1 text-[9px] ${draft.carousel.caption.length > CAROUSEL_CAPTION_MAX_CHARS ? 'text-danger' : 'text-muted'}`}>
              {draft.carousel.caption.length}/{CAROUSEL_CAPTION_MAX_CHARS}
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
              <p className="label mt-1 text-[9px] text-muted">
                Ao publicar, o gatilho de comentário dessa automação é clonado para o post novo.
              </p>
            </div>
          )}

          {ehMock && (
            <p className="rounded-md border border-danger/50 px-3 py-2 text-[11px] text-danger">
              Texto de EXEMPLO — a IA não respondeu. Os botões de salvar ficam travados até uma geração real.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={ocupado} onClick={() => void renderizar()}>
              <RefreshCw className="size-3.5" />
              {etapa === 'Renderizando…' ? etapa : 'Renderizar de novo'}
            </Button>
            <Button type="button" disabled={ocupado || precisaRenderizar || ehMock} onClick={() => void salvar(false)}>
              {etapa === 'Salvando…' ? etapa : 'Salvar rascunho'}
            </Button>
            <Button type="button" variant="ghost" disabled={ocupado || precisaRenderizar || ehMock} onClick={() => void salvar(true)}>
              Publicar agora
            </Button>
          </div>
          <p className="label text-[9px] text-muted">
            {slidesDesatualizados
              ? 'Você editou um slide: renderize de novo antes de salvar.'
              : 'As imagens são as do último render. A legenda pode mudar sem renderizar.'}
            {draft.model && ` · modelo: ${draft.model}`}
          </p>
        </section>
      )}
    </div>
  )
}
