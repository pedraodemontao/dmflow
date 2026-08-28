'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { updateDelivery, uploadDeliveryFile } from '@/app/(app)/biblioteca/entregas/actions'
import { Button, Input, Textarea } from '@/components/ui'
import type { DeliveryBlock } from '@/lib/ai/schemas'

/**
 * Ajustar o que o modelo escreveu.
 *
 * O editor é por BLOCO, não um campo de texto livre, pelo mesmo motivo que o
 * modelo devolve blocos e não HTML (`deliverySchema`): o formato é nosso, e
 * quem renderiza é a nossa página. Texto livre aqui recriaria o problema —
 * alguém colaria HTML, ou marcação que a página ignora em silêncio.
 *
 * Não dá para trocar o TIPO de um bloco. Parece uma falta, e é deliberada:
 * transformar uma lista em passo-a-passo não é editar, é reescrever, e a
 * conversão silenciosa perderia o conteúdo dos itens. Apagar e criar do tipo
 * certo é mais trabalho e nenhuma surpresa.
 */

const NOVOS: Array<{ type: DeliveryBlock['type']; label: string }> = [
  { type: 'heading', label: 'Título de seção' },
  { type: 'paragraph', label: 'Parágrafo' },
  { type: 'list', label: 'Lista' },
  { type: 'checklist', label: 'Checklist' },
  { type: 'steps', label: 'Passo a passo' },
  { type: 'quote', label: 'Citação' },
  { type: 'callout', label: 'Destaque' },
  { type: 'file', label: 'Anexo para baixar' },
]

const ROTULO: Record<DeliveryBlock['type'], string> = {
  heading: 'título',
  paragraph: 'parágrafo',
  list: 'lista',
  checklist: 'checklist',
  steps: 'passo a passo',
  quote: 'citação',
  callout: 'destaque',
  file: 'anexo',
}

function blocoVazio(type: DeliveryBlock['type']): DeliveryBlock {
  switch (type) {
    case 'list':
      return { type, items: [''] }
    case 'checklist':
      return { type, items: [''] }
    case 'steps':
      return { type, items: [{ title: '', text: '' }] }
    case 'file':
      // Nasce com caminho vazio de propósito: o schema recusa salvar assim, o
      // que impede publicar uma entrega com botão de baixar que não baixa nada.
      return { type, path: '', label: '' }
    default:
      return { type, text: '' } as DeliveryBlock
  }
}

/** Uma linha por item: é como se escreve lista, e evita um campo por item. */
function itemsParaTexto(items: string[]): string {
  return items.join('\n')
}

function textoParaItems(texto: string): string[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
}

/**
 * O anexo. Sobe na hora de escolher o arquivo, não no salvar: assim o dono vê
 * o erro de extensão ou de tamanho enquanto ainda está olhando para o campo,
 * em vez de perder o formulário inteiro no fim.
 *
 * O caminho vem do servidor e o campo dele não é editável aqui — caminho
 * digitado à mão é o vetor que o schema recusa do outro lado.
 */
function CampoArquivo({
  deliveryId,
  bloco,
  onChange,
}: {
  deliveryId: string
  bloco: Extract<DeliveryBlock, { type: 'file' }>
  onChange: (next: DeliveryBlock) => void
}) {
  const [subindo, setSubindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function escolher(file: File | undefined) {
    if (!file) return
    setErro(null)
    setSubindo(true)

    const dados = new FormData()
    dados.set('file', file)
    const resultado = await uploadDeliveryFile(deliveryId, dados)

    setSubindo(false)
    if (!resultado.ok || !resultado.path) {
      setErro(resultado.error ?? 'Falha ao subir o arquivo.')
      return
    }

    onChange({
      ...bloco,
      path: resultado.path,
      sizeBytes: resultado.sizeBytes,
      label: bloco.label || file.name,
    })
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="nome do botão (ex: Planilha de controle)"
        value={bloco.label}
        onChange={(e) => onChange({ ...bloco, label: e.target.value })}
      />

      <input
        type="file"
        accept=".pdf,.xlsx,.csv,.docx,.png,.jpg,.jpeg,.zip"
        disabled={subindo}
        onChange={(e) => escolher(e.target.files?.[0])}
        className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs file:text-foreground"
      />

      {subindo && <p className="label text-[9px] text-muted">subindo…</p>}
      {erro && <p className="label text-[9px] text-danger">{erro}</p>}
      {!subindo && !erro && bloco.path && (
        <p className="label text-[9px] text-muted">arquivo no ar: {bloco.path}</p>
      )}
      {!subindo && !erro && !bloco.path && (
        <p className="label text-[9px] text-danger">sem arquivo — não dá para salvar assim</p>
      )}
    </div>
  )
}

export function DeliveryEditor({
  id,
  title: tituloInicial,
  subtitle: subtituloInicial,
  blocks: blocosIniciais,
  onDone,
}: {
  id: string
  title: string
  subtitle: string | null
  blocks: DeliveryBlock[]
  onDone: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [titulo, setTitulo] = useState(tituloInicial)
  const [subtitulo, setSubtitulo] = useState(subtituloInicial ?? '')
  const [blocos, setBlocos] = useState<DeliveryBlock[]>(blocosIniciais)
  const [erro, setErro] = useState<string | null>(null)

  function troca(index: number, next: DeliveryBlock) {
    setBlocos((atual) => atual.map((b, i) => (i === index ? next : b)))
  }

  function move(index: number, direcao: -1 | 1) {
    const destino = index + direcao
    if (destino < 0 || destino >= blocos.length) return
    setBlocos((atual) => {
      const copia = [...atual]
      ;[copia[index], copia[destino]] = [copia[destino], copia[index]]
      return copia
    })
  }

  function salvar() {
    setErro(null)
    start(async () => {
      const result = await updateDelivery(id, {
        title: titulo,
        subtitle: subtitulo.trim() || undefined,
        blocks: blocos,
      })
      if (!result.ok) {
        setErro(result.error ?? 'Não deu para salvar.')
        return
      }
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="label mb-1.5 text-[10px] text-muted">Título</p>
        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>

      <div>
        <p className="label mb-1.5 text-[10px] text-muted">Subtítulo (opcional)</p>
        <Input value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} />
      </div>

      <div className="space-y-3">
        {blocos.map((bloco, index) => (
          <div key={index} className="rounded-sm border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="label flex-1 text-[9px] text-muted">{ROTULO[bloco.type]}</span>
              <button
                type="button"
                aria-label="Subir bloco"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="rounded-sm p-1 text-muted hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Descer bloco"
                disabled={index === blocos.length - 1}
                onClick={() => move(index, 1)}
                className="rounded-sm p-1 text-muted hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Apagar bloco"
                onClick={() => setBlocos((atual) => atual.filter((_, i) => i !== index))}
                className="rounded-sm p-1 text-muted hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {'text' in bloco && (
              <Textarea
                rows={bloco.type === 'heading' ? 1 : 3}
                value={bloco.text}
                onChange={(e) => troca(index, { ...bloco, text: e.target.value })}
              />
            )}

            {(bloco.type === 'list' || bloco.type === 'checklist') && (
              <>
                <Textarea
                  rows={Math.max(3, bloco.items.length)}
                  value={itemsParaTexto(bloco.items)}
                  onChange={(e) => troca(index, { ...bloco, items: textoParaItems(e.target.value) })}
                />
                <p className="label mt-1 text-[9px] text-muted">um item por linha</p>
              </>
            )}

            {bloco.type === 'file' && (
              <CampoArquivo
                deliveryId={id}
                bloco={bloco}
                onChange={(next) => troca(index, next)}
              />
            )}

            {bloco.type === 'steps' && (
              <div className="space-y-2">
                {bloco.items.map((passo, i) => (
                  <div key={i} className="space-y-1">
                    <Input
                      placeholder="título do passo"
                      value={passo.title}
                      onChange={(e) =>
                        troca(index, {
                          ...bloco,
                          items: bloco.items.map((p, j) =>
                            j === i ? { ...p, title: e.target.value } : p,
                          ),
                        })
                      }
                    />
                    <Textarea
                      rows={2}
                      placeholder="o que fazer"
                      value={passo.text}
                      onChange={(e) =>
                        troca(index, {
                          ...bloco,
                          items: bloco.items.map((p, j) =>
                            j === i ? { ...p, text: e.target.value } : p,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    troca(index, { ...bloco, items: [...bloco.items, { title: '', text: '' }] })
                  }
                >
                  <Plus className="size-3.5" />
                  passo
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <span className="label mr-1 text-[9px] text-muted">somar bloco:</span>
        {NOVOS.map((novo) => (
          <button
            key={novo.type}
            type="button"
            onClick={() => setBlocos((atual) => [...atual, blocoVazio(novo.type)])}
            className="label rounded-sm border border-border px-2 py-1 text-[9px] text-muted hover:border-accent hover:text-foreground"
          >
            {novo.label}
          </button>
        ))}
      </div>

      {erro && <p className="text-[11px] text-danger">{erro}</p>}

      <div className="flex items-center gap-2">
        <Button type="button" className="cta-signature" disabled={pending} onClick={salvar}>
          {pending ? 'salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
