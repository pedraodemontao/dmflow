'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { BarChart3, CalendarClock, ExternalLink, Images, Play, Send, Trash2, X } from 'lucide-react'

import {
  cancelPublication,
  deletePublication,
  publishNow,
  schedulePublication,
} from '@/app/(app)/publicacoes/actions'
import type { PublicationListItem } from '@/app/(app)/publicacoes/queries'
import { Badge, Button, Input } from '@/components/ui'

/**
 * Uma publicação na lista, com as ações que o estado permite.
 *
 * Os botões seguem o estado, não o contrário: `publishing` não tem botão
 * nenhum porque o tick já reclamou a linha e a Meta pode já ter o container;
 * `published` só tem o link. O que dá para fazer é exatamente o que a action
 * aceita — a UI não oferece o que o servidor vai recusar.
 */

const KIND_LABEL: Record<PublicationListItem['kind'], string> = {
  image: 'imagem',
  carousel: 'carrossel',
  reel: 'reel',
  story: 'story',
}

const STATUS: Record<PublicationListItem['status'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'accent' }> = {
  draft: { label: 'rascunho', tone: 'neutral' },
  scheduled: { label: 'na fila', tone: 'accent' },
  publishing: { label: 'publicando', tone: 'warning' },
  published: { label: 'no ar', tone: 'success' },
  failed: { label: 'falhou', tone: 'warning' },
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function quando(iso: string | null): string {
  return iso ? fmt.format(new Date(iso)) : ''
}

/** `datetime-local` quer `YYYY-MM-DDTHH:mm` no fuso do navegador. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function PublicationRow({ publication }: { publication: PublicationListItem }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [agendando, setAgendando] = useState(false)
  const [quandoLocal, setQuandoLocal] = useState(() => localInputValue(new Date(Date.now() + 60 * 60 * 1000)))

  const status = STATUS[publication.status]

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setErro(null)
    start(async () => {
      const result = await action()
      if (!result.ok) {
        setErro(result.error ?? 'Não deu certo.')
        return
      }
      setAgendando(false)
      router.refresh()
    })
  }

  const podeAgendar = publication.status === 'draft' || publication.status === 'scheduled' || publication.status === 'failed'
  const podeApagar = publication.status === 'draft' || publication.status === 'failed'

  return (
    <li className="border-b border-border last:border-0">
      <div className="flex gap-3 p-4">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-2">
          {publication.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- capa vem do nosso bucket, sem otimização
            <img src={publication.coverUrl} alt="" className="size-full object-cover" />
          ) : publication.kind === 'reel' ? (
            <Play className="size-4 text-muted" />
          ) : (
            <Images className="size-4 text-muted" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="label text-[9px] text-muted">
              {KIND_LABEL[publication.kind]}
              {publication.kind === 'carousel' && ` · ${publication.mediaCount} slides`}
            </span>
          </div>

          <p className="mt-1.5 line-clamp-2 text-sm leading-snug">
            {publication.caption || <span className="text-muted">sem legenda</span>}
          </p>

          <p className="label mt-1.5 text-[9px] text-muted">
            {publication.status === 'published' && `publicado ${quando(publication.publishedAt)}`}
            {(publication.status === 'scheduled' || publication.status === 'publishing') &&
              `sai ${quando(publication.scheduledAt)}`}
            {publication.status === 'draft' && `criado ${quando(publication.createdAt)}`}
            {publication.status === 'failed' &&
              `desistiu depois de ${publication.attempts} ${publication.attempts === 1 ? 'tentativa' : 'tentativas'}`}
            {publication.flowName && <span className="ml-2 text-foreground">→ {publication.flowName}</span>}
          </p>

          {publication.error && (
            <p className="mt-1.5 break-words text-[10px] leading-snug text-danger">{publication.error}</p>
          )}
          {erro && <p className="mt-1.5 text-[10px] text-danger">{erro}</p>}

          {agendando && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                type="datetime-local"
                value={quandoLocal}
                onChange={(e) => setQuandoLocal(e.target.value)}
                className="h-8 w-auto text-[11px]"
              />
              <Button
                size="sm"
                disabled={pending || !quandoLocal}
                onClick={() => run(() => schedulePublication(publication.id, new Date(quandoLocal).toISOString()))}
              >
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAgendando(false)}>
                Voltar
              </Button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {publication.status === 'published' && (
            <>
              <Link
                href={`/publicacoes/${publication.id}`}
                className="label inline-flex items-center gap-1 text-[10px] text-accent hover:text-foreground"
              >
                <BarChart3 className="size-3" /> métricas
              </Link>
              {publication.permalink && (
                <a
                  href={publication.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="label inline-flex items-center gap-1 text-[10px] text-muted hover:text-foreground"
                >
                  abrir <ExternalLink className="size-3" />
                </a>
              )}
            </>
          )}

          {podeAgendar && !agendando && (
            <>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => publishNow(publication.id))}>
                <Send className="size-3" />
                {publication.status === 'failed' ? 'Tentar de novo' : 'Agora'}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAgendando(true)}>
                <CalendarClock className="size-3" />
                {publication.status === 'scheduled' ? 'Reagendar' : 'Agendar'}
              </Button>
            </>
          )}

          {publication.status === 'scheduled' && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelPublication(publication.id))}>
              <X className="size-3" />
              Cancelar
            </Button>
          )}

          {podeApagar && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deletePublication(publication.id))}>
              <Trash2 className="size-3" />
              Excluir
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
