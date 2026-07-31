'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, Check, Image as ImageIcon, Loader2, MessageSquare, Workflow } from 'lucide-react'
import Link from 'next/link'

import { saveAutomation } from '@/app/actions'
import { FlowBuilder } from '@/components/automacoes/flow-builder'
import { PostPicker } from '@/components/automacoes/post-picker'
import { Badge, Button, Card, Input, Label, Select, Textarea } from '@/components/ui'
import type { FlowOption } from '@/lib/data'
import { emptyDefinition } from '@/lib/flow/transform'
import type { FlowDefinition } from '@/lib/flow/types'
import type { Media } from '@/lib/instagram/api'
import type { MatchMode, TriggerType } from '@/types/db'
import { cn } from '@/lib/utils'

interface Props {
  triggerId?: string
  media: Media[]
  mediaError?: string | null
  /** Opções para o bloco "pular para outro fluxo" — já sem o fluxo desta automação. */
  flowOptions: FlowOption[]
  initial?: {
    name: string
    triggerType: TriggerType
    keywords: string[]
    matchMode: MatchMode
    mediaId: string | null
    publicReply: string | null
    isActive: boolean
    definition: FlowDefinition
  }
}

const STEPS = [
  { id: 'gatilho', label: 'Gatilho', icon: ImageIcon },
  { id: 'palavras', label: 'Palavras-chave', icon: MessageSquare },
  { id: 'fluxo', label: 'Fluxo da DM', icon: Workflow },
] as const

type StepId = (typeof STEPS)[number]['id']

export function AutomationEditor({ triggerId, media, mediaError, flowOptions, initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [step, setStep] = useState<StepId>('gatilho')
  const [name, setName] = useState(initial?.name ?? 'Nova automação')
  const [triggerType, setTriggerType] = useState<TriggerType>(initial?.triggerType ?? 'comment')
  const [keywordsText, setKeywordsText] = useState((initial?.keywords ?? []).join(', '))
  const [matchMode, setMatchMode] = useState<MatchMode>(initial?.matchMode ?? 'contains')
  const [mediaId, setMediaId] = useState<string | null>(initial?.mediaId ?? null)
  const [publicReply, setPublicReply] = useState(initial?.publicReply ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [definition, setDefinition] = useState<FlowDefinition>(
    initial?.definition ?? emptyDefinition(),
  )
  const [error, setError] = useState<string | null>(null)

  const keywords = keywordsText
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await saveAutomation({
        triggerId: triggerId ?? null,
        name,
        triggerType,
        keywords,
        matchMode,
        mediaId,
        publicReply: publicReply || null,
        isActive,
        definition,
      })

      if (!result.ok) {
        setError(result.error ?? 'Não consegui salvar')
        return
      }
      router.push('/automacoes')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="glass-chrome flex h-16 shrink-0 items-center gap-4 border-b border-white/[0.06] px-6">
        <Link href="/automacoes" className="text-muted hover:text-foreground" aria-label="Voltar para automações">
          <ArrowLeft className="size-4" />
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          placeholder="Nome da automação"
        />

        <div className="flex items-center gap-1">
          {STEPS.map(({ id, label, icon: Icon }, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors',
                step === id
                  ? 'bg-surface-2 font-medium text-foreground'
                  : 'text-muted hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">
                {i + 1}. {label}
              </span>
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-accent"
          />
          Ativa
        </label>

        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Salvar
        </Button>
      </header>

      {error && (
        <p className="shrink-0 bg-danger/10 px-6 py-2.5 text-xs text-danger">{error}</p>
      )}

      {step === 'gatilho' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div>
              <h2 className="text-sm font-semibold">Quando essa automação dispara?</h2>
              <p className="mt-1 text-xs text-muted">
                O gatilho define o que a pessoa precisa fazer para entrar no fluxo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    value: 'comment',
                    title: 'Comentário em post',
                    desc: 'Comentou a palavra-chave → recebe DM',
                  },
                  {
                    value: 'keyword',
                    title: 'Palavra na DM',
                    desc: 'Mandou a palavra no direct',
                  },
                  {
                    value: 'story_reply',
                    title: 'Resposta de story',
                    desc: 'Respondeu um story seu',
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTriggerType(option.value)}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition-all duration-150',
                    triggerType === option.value
                      ? 'border-accent bg-accent/5 shadow-[0_16px_32px_-20px_rgb(242_118_46_/45%)]'
                      : 'border-border hover:-translate-y-0.5 hover:border-muted',
                  )}
                >
                  <p className="text-xs font-semibold">{option.title}</p>
                  <p className="mt-1 text-[11px] leading-tight text-muted">{option.desc}</p>
                </button>
              ))}
            </div>

            {triggerType === 'comment' && (
              <Card className="p-5">
                <h3 className="mb-1 text-sm font-semibold">Em qual post?</h3>
                <p className="mb-4 text-xs text-muted">
                  Escolha um post específico ou deixe valendo para todos.
                </p>
                <PostPicker
                  media={media}
                  loadError={mediaError}
                  selectedId={mediaId}
                  onSelect={setMediaId}
                />
              </Card>
            )}

            <div className="flex justify-end">
              <Button type="button" onClick={() => setStep('palavras')}>
                Continuar
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'palavras' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <div>
              <h2 className="text-sm font-semibold">Quais palavras disparam?</h2>
              <p className="mt-1 text-xs text-muted">
                Acentos e maiúsculas são ignorados — &quot;EU QUERO&quot; e &quot;eu quero&quot;
                funcionam igual.
              </p>
            </div>

            <Card className="space-y-4 p-5">
              <div>
                <Label>Palavras-chave (separadas por vírgula)</Label>
                <Input
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="quero, checklist, eu quero"
                />
                {keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {keywords.map((k) => (
                      <Badge key={k} tone="accent">
                        {k}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label>Como comparar</Label>
                <Select
                  value={matchMode}
                  onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                >
                  <option value="contains">Contém a palavra em qualquer lugar</option>
                  <option value="exact">É exatamente a palavra</option>
                  <option value="starts_with">Começa com a palavra</option>
                </Select>
              </div>

              {triggerType === 'comment' && (
                <div>
                  <Label>Resposta pública no comentário (opcional)</Label>
                  <Textarea
                    rows={2}
                    value={publicReply}
                    onChange={(e) => setPublicReply(e.target.value)}
                    placeholder="{Mandei no seu direct! 📩|Chegou no privado! ✨|Te respondi no direct 😉}"
                  />
                  <p className="mt-1.5 text-[11px] text-muted">
                    Responder publicamente aumenta o alcance do post e mostra prova social. Escreva
                    variações entre chaves — {'{opção1|opção2|opção3}'} — para cada resposta sair
                    diferente: texto idêntico repetido é o que o filtro de spam do Instagram remove.
                  </p>
                </div>
              )}
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep('gatilho')}>
                Voltar
              </Button>
              <Button type="button" onClick={() => setStep('fluxo')}>
                Montar o fluxo
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'fluxo' && (
        <FlowBuilder definition={definition} flowOptions={flowOptions} onChange={setDefinition} />
      )}
    </div>
  )
}
