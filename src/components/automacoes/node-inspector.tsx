'use client'

import { Plus, Trash2, X } from 'lucide-react'

import { Button, Input, Label, Select, Textarea } from '@/components/ui'
import { NODE_META } from '@/components/automacoes/flow-nodes'
import type { FlowNode } from '@/lib/flow/types'

interface Props {
  node: FlowNode
  isEntry: boolean
  onChange: (next: FlowNode) => void
  onDelete: () => void
  onClose: () => void
}

export function NodeInspector({ node, isEntry, onChange, onDelete, onClose }: Props) {
  const meta = NODE_META[node.type]
  const Icon = meta.icon

  /** Cada patch mantém o discriminante `type`, então o union continua válido. */
  function patch(partial: Partial<FlowNode>) {
    onChange({ ...node, ...partial } as FlowNode)
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Icon className={`size-4 ${meta.color}`} />
        <span className="text-sm font-semibold">{meta.label}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs leading-relaxed text-muted">{meta.description}</p>

        {(node.type === 'message' || node.type === 'buttons') && (
          <div>
            <Label>Texto da mensagem</Label>
            <Textarea
              rows={4}
              value={node.text}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder="Oi {{nome}}, tudo bem?"
            />
            <p className="mt-1.5 text-[11px] text-muted">
              Use <code className="text-accent">{'{{nome}}'}</code> e{' '}
              <code className="text-accent">{'{{username}}'}</code> para personalizar, e{' '}
              <code className="text-accent">{'{opção1|opção2}'}</code> para variar o texto a cada
              envio — mensagem idêntica em volume dispara o filtro de spam.
            </p>
          </div>
        )}

        {node.type === 'message' && (
          <div>
            <Label>Respostas rápidas</Label>
            <div className="space-y-2">
              {(node.quickReplies ?? []).map((qr, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={qr.title}
                    maxLength={20}
                    placeholder="Texto do botão"
                    onChange={(e) => {
                      const next = [...(node.quickReplies ?? [])]
                      next[i] = { title: e.target.value, payload: e.target.value.toUpperCase() }
                      patch({ quickReplies: next })
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() =>
                      patch({ quickReplies: (node.quickReplies ?? []).filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="w-full"
                onClick={() =>
                  patch({
                    quickReplies: [
                      ...(node.quickReplies ?? []),
                      { title: 'Quero sim', payload: 'SIM' },
                    ],
                  })
                }
              >
                <Plus className="size-3.5" />
                Adicionar resposta rápida
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">Máximo 20 caracteres por botão.</p>
          </div>
        )}

        {node.type === 'buttons' && (
          <div>
            <Label>Botões (máximo 3)</Label>
            <div className="space-y-3">
              {node.buttons.map((b, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-muted">Botão {i + 1}</span>
                    <button
                      type="button"
                      className="text-muted hover:text-danger"
                      onClick={() => patch({ buttons: node.buttons.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Input
                    className="mb-2"
                    value={b.title}
                    maxLength={20}
                    placeholder="Texto do botão"
                    onChange={(e) => {
                      const next = [...node.buttons]
                      next[i] = { ...next[i], title: e.target.value }
                      patch({ buttons: next })
                    }}
                  />
                  <Input
                    value={b.url ?? ''}
                    placeholder="https://link-de-destino.com"
                    onChange={(e) => {
                      const next = [...node.buttons]
                      next[i] = { ...next[i], url: e.target.value || undefined }
                      patch({ buttons: next })
                    }}
                  />
                </div>
              ))}
              {node.buttons.length < 3 && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="w-full"
                  onClick={() => patch({ buttons: [...node.buttons, { title: 'Novo botão' }] })}
                >
                  <Plus className="size-3.5" />
                  Adicionar botão
                </Button>
              )}
            </div>
          </div>
        )}

        {node.type === 'wait_reply' && (
          <div>
            <Label>Guardar resposta como</Label>
            <Input
              value={node.saveAs ?? ''}
              placeholder="resposta"
              onChange={(e) => patch({ saveAs: e.target.value || undefined })}
            />
            <p className="mt-1.5 text-[11px] text-muted">
              Use depois no texto com <code className="text-accent">{'{{resposta}}'}</code>.
            </p>
          </div>
        )}

        {node.type === 'delay' && (
          <div>
            <Label>Esperar</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={Math.max(1, Math.round(node.seconds / 60))}
                onChange={(e) => patch({ seconds: Math.max(60, Number(e.target.value) * 60) })}
              />
              <Select
                className="w-32"
                value={node.seconds >= 3600 ? 'h' : 'm'}
                onChange={(e) => {
                  const minutes = Math.max(1, Math.round(node.seconds / 60))
                  patch({ seconds: e.target.value === 'h' ? minutes * 3600 : minutes * 60 })
                }}
              >
                <option value="m">minutos</option>
                <option value="h">horas</option>
              </Select>
            </div>
            <p className="mt-1.5 text-[11px] text-warning">
              Lembre da janela de 24h: passou disso, a DM não sai.
            </p>
          </div>
        )}

        {node.type === 'tag' && (
          <>
            <div>
              <Label>Adicionar etiquetas (separadas por vírgula)</Label>
              <Input
                value={(node.add ?? []).join(', ')}
                placeholder="lead, interessado"
                onChange={(e) =>
                  patch({
                    add: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div>
              <Label>Remover etiquetas</Label>
              <Input
                value={(node.remove ?? []).join(', ')}
                placeholder="frio"
                onChange={(e) =>
                  patch({
                    remove: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </>
        )}

        {node.type === 'condition' && (
          <div>
            <Label>Caminhos</Label>
            <div className="space-y-3">
              {node.cases.map((branch, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-muted">Caminho {i + 1}</span>
                    <button
                      type="button"
                      className="text-muted hover:text-danger"
                      onClick={() => patch({ cases: node.cases.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Select
                    className="mb-2"
                    value={branch.source}
                    onChange={(e) => {
                      const next = [...node.cases]
                      next[i] = { ...next[i], source: e.target.value }
                      patch({ cases: next })
                    }}
                  >
                    <option value="last_input">A última resposta</option>
                    <option value="tags">As etiquetas</option>
                  </Select>
                  <div className="flex gap-2">
                    <Select
                      className="w-32"
                      value={branch.op}
                      onChange={(e) => {
                        const next = [...node.cases]
                        next[i] = { ...next[i], op: e.target.value as typeof branch.op }
                        patch({ cases: next })
                      }}
                    >
                      <option value="contains">contém</option>
                      <option value="equals">é igual a</option>
                      <option value="starts_with">começa com</option>
                      <option value="has_tag">tem a etiqueta</option>
                      <option value="exists">existe</option>
                    </Select>
                    <Input
                      value={branch.value ?? ''}
                      placeholder="sim"
                      onChange={(e) => {
                        const next = [...node.cases]
                        next[i] = { ...next[i], value: e.target.value }
                        patch({ cases: next })
                      }}
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="w-full"
                onClick={() =>
                  patch({
                    cases: [
                      ...node.cases,
                      { source: 'last_input', op: 'contains', value: '', next: null },
                    ],
                  })
                }
              >
                <Plus className="size-3.5" />
                Adicionar caminho
              </Button>
            </div>
          </div>
        )}

        {node.type === 'http' && (
          <>
            <div>
              <Label>URL do webhook</Label>
              <Input
                value={node.url}
                placeholder="https://seu-n8n.com/webhook/abc"
                onChange={(e) => patch({ url: e.target.value })}
              />
            </div>
            <div>
              <Label>Método</Label>
              <Select
                value={node.method}
                onChange={(e) => patch({ method: e.target.value as 'GET' | 'POST' })}
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </Select>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-border p-4">
        <Button
          variant="danger"
          size="sm"
          type="button"
          className="w-full"
          disabled={isEntry}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          {isEntry ? 'O bloco inicial não pode ser removido' : 'Excluir bloco'}
        </Button>
      </div>
    </div>
  )
}
