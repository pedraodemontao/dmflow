'use client'

import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'

import { Button, Select } from '@/components/ui'
import type { Script } from '@/lib/ai/schemas'
import { ScriptView } from '@/components/biblioteca/script-view'

/**
 * O botão que fecha o ciclo da biblioteca.
 *
 * Sem ele a tela é um acervo bonito: mostra o que performou e para aí. É este
 * botão que transforma referência em roteiro — pega o vídeo que deu certo no
 * nicho e escreve um novo, na voz do dono, usando aquele como molde.
 *
 * A geração é uma chamada paga ao modelo e demora dezenas de segundos, então a
 * tela nunca pode deixar dúvida se algo está acontecendo. E quando falha, o
 * motivo aparece por escrito: os erros da rota são específicos de propósito
 * ("nenhuma persona ativa", "etapa sem CTA"), e engoli-los num "algo deu
 * errado" jogaria fora a única pista de como consertar.
 */

const ETAPAS = [
  { value: 'topo', label: 'Topo — quem nem sabe do problema' },
  { value: 'meio', label: 'Meio — já sabe, quer prova' },
  { value: 'fundo', label: 'Fundo — quer comprar' },
] as const

export function GenerateScript({ itemId, autor }: { itemId: string; autor: string | null }) {
  const [aberto, setAberto] = useState(false)
  const [etapa, setEtapa] = useState<string>('meio')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [script, setScript] = useState<Script | null>(null)

  async function gerar() {
    setCarregando(true)
    setErro(null)
    try {
      const res = await fetch('/api/scripts/generate-from-item', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ libraryItemId: itemId, funnelStage: etapa }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string; script?: Script }

      // A rota devolve o roteiro MESMO quando falha ao gravar — o dono já pagou
      // a geração, e esconder o texto o faria pagar de novo.
      if (json.script) setScript(json.script)
      if (!json.ok) setErro(json.error ?? 'Não consegui gerar o roteiro.')
    } catch {
      setErro('A geração não respondeu. Tente de novo.')
    } finally {
      setCarregando(false)
    }
  }

  if (!aberto) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Sparkles className="size-3.5" />
        Gerar roteiro
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/85 p-4 sm:p-8">
      <div className="pop-panel w-full max-w-2xl rounded-md">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Sparkles className="size-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="label text-[9px] text-muted">Roteiro modelado</p>
            <p className="truncate text-sm">{autor ? `a partir de @${autor}` : 'a partir deste vídeo'}</p>
          </div>
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="rounded-sm text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {!script && (
            <>
              <div>
                <p className="label mb-1.5 text-[10px] text-muted">Para quem é este vídeo</p>
                <Select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
                  {ETAPAS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  A etapa muda o fecho: topo não pede a palavra-chave, meio e fundo pedem. Escrever
                  copy de fundo para público de topo é o erro que faz o anúncio não converter.
                </p>
              </div>

              <Button
                type="button"
                className="cta-signature w-full"
                disabled={carregando}
                onClick={gerar}
              >
                {carregando ? 'escrevendo… (pode levar 1 min)' : 'Escrever o roteiro'}
              </Button>
            </>
          )}

          {erro && <p className="text-[11px] leading-relaxed text-danger">{erro}</p>}

          {script && <ScriptView script={script} />}
        </div>
      </div>
    </div>
  )
}

