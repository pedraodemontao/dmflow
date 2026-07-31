'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, Check, Image as ImageIcon, Loader2, MessageSquare, Workflow } from 'lucide-react'
import Link from 'next/link'

import { saveAutomation } from '@/app/actions'
import { FlowBuilder } from '@/components/automacoes/flow-builder'
import { PostPicker } from '@/components/automacoes/post-picker'
import { Badge, Button, Card, Input, Label, Select, Textarea } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
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
  const toast = useToast()
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
        // A faixa fica: erro de salvar aqui é quase sempre algo a corrigir no
        // fluxo (palavra-chave faltando, texto sem variação), e o texto precisa
        // continuar na tela enquanto a correção é feita. O toast é o que chama
        // a atenção quando o olho está no canvas, longe do topo.
        setError(result.error ?? 'Não consegui salvar')
        toast.error(result.error ?? 'Não consegui salvar a automação.')
        return
      }
      // A tela troca para a lista — sem o aviso, salvar e não salvar têm o
      // mesmo efeito visível.
      toast.success(`“${name}” salva.`)
      router.push('/automacoes')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="chrome-panel flex h-16 shrink-0 items-center gap-4 border-b px-6">
        <Link
          href="/automacoes"
          className="text-muted hover:text-foreground"
          aria-label="Voltar para automações"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted"
          placeholder="Nome da automação"
        />

        {/* Abas em monospace caixa alta, marcadas por um traço limão embaixo —
            a caneta marca-texto passando no passo aberto. Nada de pílula
            preenchida: o passo ativo é UM entre três, não um botão. */}
        <div className="flex items-stretch gap-1 self-stretch">
          {STEPS.map(({ id, label, icon: Icon }, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              aria-current={step === id ? 'step' : undefined}
              className={cn(
                'label flex items-center gap-1.5 border-b-2 px-3 text-[10px] transition-colors duration-150',
                'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:outline-none',
                step === id
                  ? 'border-accent text-foreground'
                  : 'border-transparent text-muted hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">
                {i + 1}. {label}
              </span>
            </button>
          ))}
        </div>

        <label className="label flex cursor-pointer items-center gap-2 text-[10px] text-muted">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-accent"
          />
          Ativa
        </label>

        <Button type="button" size="sm" className="cta-signature" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Salvar
        </Button>
      </header>

      {error && (
        <p className="shrink-0 border-b border-danger/40 bg-danger/10 px-6 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}

      {step === 'gatilho' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div>
              <p className="label text-[10px] text-muted">Passo 1 · Gatilho</p>
              <h2 className="display mt-2 text-2xl">Quando essa automação dispara?</h2>
              <p className="mt-2 text-xs text-muted">
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
                  aria-pressed={triggerType === option.value}
                  onClick={() => setTriggerType(option.value)}
                  className={cn(
                    // Escolhido = preenchido de limão com texto escuro, a
                    // mesma marcação do bloco selecionado no canvas. Uma só
                    // gramática de seleção no produto inteiro.
                    'rounded-md border p-4 text-left transition-colors duration-150',
                    'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                    triggerType === option.value
                      ? 'border-accent bg-accent text-background'
                      : 'border-border bg-surface hover:border-muted',
                  )}
                >
                  <p className="label text-[10px]">{option.title}</p>
                  <p
                    className={cn(
                      'mt-1.5 text-[11px] leading-tight',
                      triggerType === option.value ? 'text-background/80' : 'text-muted',
                    )}
                  >
                    {option.desc}
                  </p>
                </button>
              ))}
            </div>

            {triggerType === 'comment' && (
              <Card className="p-5">
                <h3 className="label text-[11px] text-foreground">Em qual post?</h3>
                <p className="mt-1.5 mb-4 text-xs text-muted">
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
              <p className="label text-[10px] text-muted">Passo 2 · Palavras-chave</p>
              <h2 className="display mt-2 text-2xl">Quais palavras disparam?</h2>
              <p className="mt-2 text-xs text-muted">
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
