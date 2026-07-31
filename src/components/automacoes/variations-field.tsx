'use client'

import { useState } from 'react'
import { Plus, Trash2, Wand2 } from 'lucide-react'

import { Button, Label, Textarea } from '@/components/ui'
import { joinVariations, splitVariations, variantCount } from '@/lib/flow/variation'
import { cn } from '@/lib/utils'

/**
 * Campo de variações.
 *
 * A trava anti-spam exige que todo texto visível tenha mais de uma versão, mas
 * a interface era um campo de texto só — para cumprir a regra o dono teria que
 * digitar `{a|b|c}` de cabeça. Ele tentou empilhar uma frase embaixo da outra,
 * que é a leitura natural de "escreva três versões", e a ferramenta recusou
 * sem ensinar. Trava que o usuário não consegue satisfazer não é proteção, é
 * beco sem saída.
 *
 * Aqui cada versão é um campo. A sintaxe some da vista e vira detalhe de
 * armazenamento.
 *
 * O modo avançado existe porque spintax no MEIO da frase ("Oi {fulano|amigo},
 * chegou") é legítimo, mais poderoso e não cabe numa lista de campos. Quando o
 * texto salvo tem essa forma, o componente abre direto nele em vez de destruir
 * o que já estava escrito.
 */
export function VariationsField({
  label,
  value,
  onChange,
  min,
  hint,
  placeholders,
}: {
  label: string
  /** O texto como fica salvo — spintax, não a lista. */
  value: string
  onChange: (next: string) => void
  /** Mínimo de variações exigido pela trava. 3 na resposta pública, 2 no resto. */
  min: number
  hint?: string
  /** Exemplos, um por linha, para o dono ver o tom esperado. */
  placeholders?: string[]
}) {
  const parsed = splitVariations(value)
  // Texto com spintax no meio da frase não vira lista — abre no modo bruto.
  const complexo = Boolean(value.trim()) && parsed === null && value.includes('{')
  const [raw, setRaw] = useState(complexo)

  const variations = parsed ?? (value.trim() ? [value] : [''])
  const total = variantCount(value)
  const falta = Math.max(min - total, 0)

  function commit(next: string[]) {
    onChange(joinVariations(next))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <Label className="mb-0">{label}</Label>
        <button
          type="button"
          onClick={() => setRaw((v) => !v)}
          className="label text-[9px] text-muted hover:text-foreground"
        >
          {raw ? 'voltar para a lista' : 'modo avançado'}
        </button>
      </div>

      {raw ? (
        <>
          <Textarea
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Oi {fulano|amigo}, {chegou|tá aí} o material"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Modo bruto: escreva as opções entre chaves separadas por barra. Dá para usar no meio
            da frase, e cada grupo multiplica o total de versões.
          </p>
        </>
      ) : (
        <div className="space-y-2">
          {variations.map((variation, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="label mt-2.5 w-4 shrink-0 text-[9px] text-muted tabular-nums">
                {index + 1}
              </span>
              <Textarea
                rows={2}
                value={variation}
                placeholder={placeholders?.[index] ?? 'Escreva uma versão dessa mensagem'}
                onChange={(e) => {
                  const next = [...variations]
                  next[index] = e.target.value
                  commit(next)
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Remover esta versão"
                // Some quando só resta uma: remover a última deixaria o campo
                // sem nenhum lugar para escrever.
                className={cn('mt-1', variations.length === 1 && 'invisible')}
                onClick={() => commit(variations.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => commit([...variations, ''])}
          >
            <Plus className="size-3.5" />
            Adicionar versão
          </Button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Wand2 className={cn('size-3.5 shrink-0', falta > 0 ? 'text-warning' : 'text-accent')} />
        <span className={cn('label text-[9px]', falta > 0 ? 'text-warning' : 'text-muted')}>
          {total} {total === 1 ? 'versão' : 'versões'}
          {falta > 0 && ` · faltam ${falta} para poder ativar`}
        </span>
      </div>

      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{hint}</p>}
    </div>
  )
}
