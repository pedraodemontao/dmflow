'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ChevronDown, Plus, Power, Users } from 'lucide-react'

import { addTrackedProfile, setProfileActive } from '@/app/(app)/biblioteca/actions'
import { importDefaultProfiles } from '@/app/actions'
import type { LibraryProfileSummary } from '@/app/(app)/biblioteca/queries'
import { RunScrape } from '@/components/biblioteca/run-scrape'
import { Button, Card, Input } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Gerenciar os perfis rastreados, sempre alcançável.
 *
 * Antes, adicionar perfil e importar a lista curada só existiam DENTRO do
 * estado vazio "nenhum perfil". Bastava ter um perfil cadastrado para as duas
 * ações desaparecerem — e foi o que aconteceu em 01/08/2026: o dono cadastrou
 * um perfil, ele tinha caído do Instagram, a raspagem não trouxe nada, e a
 * tela não oferecia jeito nenhum de cadastrar outro. Ficou preso.
 *
 * A lição: ação que existe só no estado vazio some justamente quando o estado
 * deixa de ser vazio — e um perfil ruim é "não vazio" para a tela e "vazio" na
 * prática para o dono.
 */
export function ProfileManager({
  profiles,
  custoEstimado,
}: {
  profiles: LibraryProfileSummary[]
  custoEstimado: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [aberto, setAberto] = useState(false)
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const ativos = profiles.filter((profile) => profile.isActive)

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const result = await action()
      setErro(result.ok ? null : (result.error ?? 'Não deu certo.'))
      router.refresh()
    })
  }

  return (
    <Card className="mb-5">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <Users className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="label text-[10px] text-muted">Perfis de referência</p>
          <p className="mt-0.5 text-sm">
            {ativos.length} {ativos.length === 1 ? 'perfil ativo' : 'perfis ativos'}
            {profiles.length > ativos.length && (
              <span className="text-muted"> · {profiles.length - ativos.length} desligado(s)</span>
            )}
          </p>
        </div>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted transition-transform', aberto && 'rotate-180')}
        />
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-border p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!novo.trim()) return
              run(async () => {
                const result = await addTrackedProfile(novo)
                if (result.ok) setNovo('')
                return result
              })
            }}
          >
            <Input
              value={novo}
              placeholder="perfil do nicho, sem o @"
              onChange={(e) => setNovo(e.target.value)}
            />
            <Button type="submit" variant="outline" size="sm" disabled={pending || !novo.trim()}>
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </form>

          {profiles.length === 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(importDefaultProfiles)}
            >
              Importar a lista curada (31 perfis)
            </Button>
          )}

          {profiles.length > 0 && (
            <ul className="divide-y divide-border">
              {profiles.map((profile) => (
                <li key={profile.id} className="flex items-center gap-3 py-2">
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs',
                      profile.isActive ? 'text-foreground' : 'text-muted line-through',
                    )}
                  >
                    @{profile.username}
                    {profile.category && (
                      <span className="label ml-2 text-[9px] text-muted">{profile.category}</span>
                    )}
                  </span>

                  <span className="label shrink-0 text-[9px] text-muted">
                    {profile.lastScrapedAt ? 'já raspado' : 'na fila'}
                  </span>

                  <button
                    type="button"
                    disabled={pending}
                    title={profile.isActive ? 'Desligar da raspagem' : 'Ligar de novo'}
                    onClick={() => run(() => setProfileActive(profile.id, !profile.isActive))}
                    className={cn(
                      'shrink-0 rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      profile.isActive ? 'text-muted hover:text-danger' : 'text-muted hover:text-accent',
                    )}
                  >
                    <Power className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {erro && <p className="text-[11px] text-danger">{erro}</p>}

          {ativos.length > 0 && (
            <div className="border-t border-border pt-4">
              <RunScrape custoEstimado={custoEstimado} perfisAtivos={ativos.length} />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
