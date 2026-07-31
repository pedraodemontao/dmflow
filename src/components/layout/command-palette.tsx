'use client'

import { useRouter } from 'next/navigation'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import {
  CornerDownLeft,
  LayoutDashboard,
  MessageSquarePlus,
  MessagesSquare,
  Plus,
  Search,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { Avatar, Badge } from '@/components/ui'
import { matchesQuery, stripHandle, type SearchResponse } from '@/lib/search'
import { cn } from '@/lib/utils'

/** Espera a digitação parar antes de bater no servidor — uma consulta por tecla é o defeito clássico. */
const DEBOUNCE_MS = 180
/** Precisa bater com o mínimo de `/api/busca`; abaixo disso a rota devolve vazio. */
const MIN_QUERY = 2

const LIST_ID = 'command-palette-list'
const optionId = (index: number) => `command-palette-option-${index}`

interface RouteCommand {
  id: string
  href: string
  label: string
  detail: string
  /** Sinônimos que ninguém vê, mas que fazem "inbox" achar Conversas. */
  keywords: string
  icon: LucideIcon
}

const ROUTES: RouteCommand[] = [
  {
    id: 'painel',
    href: '/',
    label: 'Painel',
    detail: 'Visão geral do dia',
    keywords: 'dashboard inicio home cockpit risco',
    icon: LayoutDashboard,
  },
  {
    id: 'automacoes',
    href: '/automacoes',
    label: 'Automações',
    detail: 'Gatilhos e fluxos',
    keywords: 'fluxos gatilhos triggers',
    icon: Zap,
  },
  {
    id: 'contatos',
    href: '/contatos',
    label: 'Contatos',
    detail: 'Quem já falou com a conta',
    keywords: 'leads pessoas etiquetas tags',
    icon: Users,
  },
  {
    id: 'conversas',
    href: '/conversas',
    label: 'Conversas',
    detail: 'Caixa de entrada',
    keywords: 'inbox dm mensagens atendimento',
    icon: MessagesSquare,
  },
  {
    id: 'ice-breakers',
    href: '/ice-breakers',
    label: 'Ice breakers',
    detail: 'Perguntas fixas do direct',
    keywords: 'perguntas iniciais quebra gelo',
    icon: MessageSquarePlus,
  },
  {
    id: 'nova-automacao',
    href: '/automacoes/nova',
    label: 'Nova automação',
    detail: 'Criar do zero',
    keywords: 'criar adicionar novo fluxo',
    icon: Plus,
  },
]

interface PaletteItem {
  id: string
  href: string
  label: string
  detail?: string | null
  icon?: LucideIcon
  avatar?: { src: string | null; verified: boolean }
  badge?: { text: string; tone: 'success' | 'neutral' }
}

interface PaletteGroup {
  label: string
  items: PaletteItem[]
}

/**
 * Resposta do servidor CARIMBADA com o termo que a gerou. É o que garante que
 * resultado de busca velha nunca apareça sob busca nova: o render só aceita o
 * resultado cujo termo é o que está no campo agora — qualquer outro é tratado
 * como "ainda carregando", sem depender de a requisição ter sido cancelada a
 * tempo.
 */
type SearchResult =
  | { term: string; status: 'ready'; data: SearchResponse }
  | { term: string; status: 'error' }

type RemoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: SearchResponse }
  | { status: 'error' }

/* -------------------------------------------------------------------------- */
/*  Provider — dono do atalho global e do estado aberto/fechado                */
/* -------------------------------------------------------------------------- */

const CommandPaletteContext = createContext<{ open: () => void } | null>(null)

export function useCommandPalette() {
  const value = useContext(CommandPaletteContext)
  if (!value) throw new Error('useCommandPalette exige <CommandPaletteProvider> acima na árvore')
  return value
}

/**
 * Monta a paleta uma vez no shell do painel. A paleta em si só existe no DOM
 * enquanto está aberta — assim todo o estado (busca, seleção, requisição em
 * voo) nasce limpo a cada abertura, sem efeito de limpeza espalhado.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // ⌘K no Mac, Ctrl+K no resto. `preventDefault` porque o Chrome usa
      // Ctrl+K para focar a barra de endereço.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsOpen((value) => !value)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const api = useMemo(() => ({ open: () => setIsOpen(true) }), [])

  return (
    <CommandPaletteContext.Provider value={api}>
      {children}
      {isOpen && <CommandPalette onClose={() => setIsOpen(false)} />}
    </CommandPaletteContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*  Gatilho visível — ninguém aperta ⌘K se ninguém contar que existe           */
/* -------------------------------------------------------------------------- */

/** O sistema nunca muda no meio da sessão: assinatura vazia de propósito. */
const neverChanges = () => () => {}

/**
 * Rótulo do atalho conforme o sistema. Lido por `useSyncExternalStore` porque
 * `navigator` não existe no servidor: o HTML sai com "⌘K" (o snapshot do
 * servidor) e o cliente troca para "Ctrl K" fora do Mac sem risco de erro de
 * hidratação.
 */
function useShortcutLabel(): string {
  const isMac = useSyncExternalStore(
    neverChanges,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent),
    () => true,
  )

  return isMac ? '⌘K' : 'Ctrl K'
}

export function CommandPaletteTrigger({ className }: { className?: string }) {
  const { open } = useCommandPalette()
  const shortcut = useShortcutLabel()

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'label flex w-full items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-[10px] text-muted transition-colors duration-150',
        'hover:border-muted/70 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        className,
      )}
    >
      <Search className="size-4 shrink-0" />
      <span className="flex-1 text-left">Buscar</span>
      <Kbd>{shortcut}</Kbd>
    </button>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted">
      {children}
    </kbd>
  )
}

/* -------------------------------------------------------------------------- */
/*  A paleta                                                                  */
/* -------------------------------------------------------------------------- */

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  /** Rolar o item para dentro da vista só quando quem moveu foi o teclado. */
  const keyboardNav = useRef(false)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  /**
   * A seleção guarda a lista em que foi feita. Lista mudou (outra busca,
   * resposta nova), a seleção volta sozinha para o topo no próprio render —
   * sem isso o Enter abriria o item que por acaso caiu na posição antiga.
   */
  const [selection, setSelection] = useState({ listKey: '', index: 0 })

  const trimmed = query.trim()
  const term = stripHandle(trimmed)

  // Foco vai para o campo ao abrir e volta para quem abriu ao fechar; a página
  // atrás para de rolar enquanto a paleta está no ar.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  // Busca no servidor: espera a digitação parar e cancela a requisição
  // anterior ao sair. Duas defesas contra resposta fora de ordem — o `abort`
  // (a requisição morta rejeita e nem chega no `setResult`) e o carimbo do
  // termo, conferido no render.
  useEffect(() => {
    if (term.length < MIN_QUERY) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/busca?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`busca falhou: ${response.status}`)

        setResult({ term, status: 'ready', data: (await response.json()) as SearchResponse })
      } catch {
        if (controller.signal.aborted) return
        setResult({ term, status: 'error' })
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term])

  const remote = useMemo<RemoteState>(() => {
    if (term.length < MIN_QUERY) return { status: 'idle' }
    // Resultado de outro termo (ou nenhum ainda) não vale como resposta desta
    // busca — some da tela em vez de piscar como se fosse dela.
    if (!result || result.term !== term) return { status: 'loading' }
    return result.status === 'error' ? { status: 'error' } : { status: 'ready', data: result.data }
  }, [term, result])

  const { groups, items, listKey } = useMemo(() => {
    const built: PaletteGroup[] = []

    const routes = ROUTES.filter((route) =>
      matchesQuery(`${route.label} ${route.detail} ${route.keywords}`, trimmed),
    ).map<PaletteItem>((route) => ({
      id: `route:${route.id}`,
      href: route.href,
      label: route.label,
      detail: route.detail,
      icon: route.icon,
    }))
    if (routes.length > 0) built.push({ label: 'Ir para', items: routes })

    if (remote.status === 'ready') {
      if (remote.data.contacts.length > 0) {
        built.push({
          label: 'Contatos',
          items: remote.data.contacts.map((contact) => ({
            id: `contact:${contact.id}`,
            href: `/contatos/${contact.id}`,
            label: contact.label,
            detail: contact.detail,
            avatar: { src: contact.avatarUrl, verified: contact.verified },
          })),
        })
      }

      if (remote.data.automations.length > 0) {
        built.push({
          label: 'Automações',
          items: remote.data.automations.map((automation) => ({
            id: `automation:${automation.id}`,
            href: `/automacoes/${automation.id}`,
            label: automation.name,
            detail: 'Abrir no builder',
            icon: Zap,
            badge: automation.isActive
              ? { text: 'ativa', tone: 'success' as const }
              : { text: 'pausada', tone: 'neutral' as const },
          })),
        })
      }
    }

    const flat = built.flatMap((group) => group.items)
    return { groups: built, items: flat, listKey: flat.map((item) => item.id).join('|') }
  }, [trimmed, remote])

  const activeIndex =
    selection.listKey === listKey ? Math.min(selection.index, Math.max(items.length - 1, 0)) : 0

  // O item selecionado sempre visível, inclusive quando a seleção dá a volta
  // do fim para o começo.
  useEffect(() => {
    if (!keyboardNav.current) return
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function go(item: PaletteItem) {
    onClose()
    router.push(item.href)
  }

  function select(index: number, fromKeyboard: boolean) {
    keyboardNav.current = fromKeyboard
    // `mousemove` dispara a cada pixel: sem esta saída, passar o mouse por uma
    // linha só já custaria uma dezena de renders.
    if (index === activeIndex) return
    setSelection({ listKey, index })
  }

  function move(delta: number) {
    if (items.length === 0) return
    select((activeIndex + delta + items.length) % items.length, true)
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      select(0, true)
    } else if (event.key === 'End') {
      event.preventDefault()
      select(Math.max(items.length - 1, 0), true)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[activeIndex]
      if (item) go(item)
    }
  }

  /**
   * Prende o Tab dentro do diálogo. Na prática o campo de busca é o único
   * elemento focável aqui (as opções são `role="option"`, dirigidas por
   * `aria-activedescendant`), então o ciclo devolve o foco para ele mesmo —
   * que é exatamente o que se quer: nada atrás da paleta recebe foco.
   */
  function trapTab(event: ReactKeyboardEvent<HTMLDivElement>) {
    const container = dialogRef.current
    if (!container) return

    const focusable = [
      ...container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ]
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const edge = event.shiftKey ? first : last

    if (document.activeElement === edge || !container.contains(document.activeElement)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Tab') trapTab(event)
  }

  const activeItem = items[activeIndex]
  const showEmptyState =
    items.length === 0 && remote.status !== 'loading' && remote.status !== 'error'

  return (
    <div
      className="command-veil fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-[12vh]"
      // `mousedown` em vez de `click`: arrastar de dentro da lista e soltar
      // fora não deve ser lido como clique fora.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onKeyDown={handleDialogKeyDown}
        className="command-panel pop-panel flex w-full max-w-xl flex-col overflow-hidden rounded-md"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              keyboardNav.current = false
              // Lista nova começa do começo, mesmo que a anterior estivesse
              // rolada até o fim.
              if (listRef.current) listRef.current.scrollTop = 0
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Buscar página, contato ou automação"
            aria-label="Buscar no painel"
            role="combobox"
            aria-expanded
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? optionId(activeIndex) : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>

        <div
          ref={listRef}
          id={LIST_ID}
          role="listbox"
          aria-label="Resultados da busca"
          className="max-h-[52vh] overflow-y-auto overscroll-contain p-1.5"
        >
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <p className="label px-3 pb-1.5 pt-3 text-[10px] text-muted">
                {group.label}
              </p>

              {group.items.map((item) => {
                const index = items.indexOf(item)
                const active = index === activeIndex
                const Icon = item.icon

                return (
                  <div
                    key={item.id}
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    aria-selected={active}
                    onMouseMove={() => select(index, false)}
                    onClick={() => go(item)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 transition-colors duration-100',
                      // Seleção é o lugar certo do acento: existe uma por vez,
                      // some quando a paleta fecha, e o texto por cima vira
                      // escuro (~15:1). Espalhar limão em lista inteira seria
                      // o excesso que a direção proíbe.
                      active ? 'bg-accent text-background' : 'hover:bg-surface-2',
                    )}
                  >
                    {item.avatar ? (
                      <Avatar
                        src={item.avatar.src}
                        label={item.label}
                        size="sm"
                        verified={item.avatar.verified}
                      />
                    ) : (
                      Icon && (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-2 text-muted">
                          <Icon className="size-4" />
                        </span>
                      )
                    )}

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-sm text-foreground',
                          active && 'font-semibold',
                        )}
                      >
                        {item.label}
                      </span>
                      {item.detail && (
                        <span className="block truncate text-xs text-muted">{item.detail}</span>
                      )}
                    </span>

                    {item.badge && <Badge tone={item.badge.tone}>{item.badge.text}</Badge>}
                  </div>
                )
              })}
            </div>
          ))}

          {remote.status === 'loading' && (
            <p className="px-3 py-4 text-center text-xs text-muted">
              Buscando contatos e automações…
            </p>
          )}

          {remote.status === 'error' && (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-medium text-foreground">Não deu para buscar agora</p>
              <p className="mt-1 text-xs text-muted">
                A busca no servidor falhou. Apague uma letra e digite de novo.
              </p>
            </div>
          )}

          {showEmptyState && (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-medium text-foreground">Nada encontrado</p>
              <p className="mt-1 text-xs text-muted">
                {term.length < MIN_QUERY
                  ? `Digite ao menos ${MIN_QUERY} letras para buscar contato e automação.`
                  : `Nenhuma página, contato ou automação com “${trimmed}”.`}
              </p>
            </div>
          )}
        </div>

        <div className="label flex items-center gap-4 border-t border-border px-4 py-2.5 text-[9px] text-muted">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navegar
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft className="size-3" />
            </Kbd>
            abrir
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            fechar
          </span>
        </div>
      </div>
    </div>
  )
}
