import { Card } from '@/components/ui'
import { deliveryFileUrl } from '@/lib/delivery/file-url'
import type { DeliveryBlock } from '@/lib/ai/schemas'

/**
 * Os tipos de bloco, renderizados por componentes nossos — nunca HTML
 * vindo do modelo (ver `deliverySchema`, `src/lib/ai/schemas.ts`). Mobile
 * primeiro, direção "Marcador": quase todo mundo abre pelo navegador do
 * Instagram, no celular.
 */

function Heading({ text }: { text: string }) {
  return <h2 className="display mt-9 text-2xl text-foreground first:mt-0">{text}</h2>
}

function Paragraph({ text }: { text: string }) {
  return <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">{text}</p>
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-foreground/90">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-foreground/90">
          <span aria-hidden className="mt-1 h-4 w-4 shrink-0 rounded-sm border border-muted" />
          {item}
        </li>
      ))}
    </ul>
  )
}

function Steps({ items }: { items: Array<{ title: string; text: string }> }) {
  return (
    <div className="mt-3 space-y-3">
      {items.map((step, index) => (
        <Card key={index} className="p-4">
          <p className="label text-[10px] text-accent">Passo {index + 1}</p>
          <p className="mt-1 font-semibold text-foreground">{step.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{step.text}</p>
        </Card>
      ))}
    </div>
  )
}

function Quote({ text }: { text: string }) {
  return (
    // `whitespace-pre-wrap`: a entrega do comparativo Codex (30/08) carrega um
    // prompt de 250 linhas num quote — sem isto o navegador colapsa as quebras
    // e o material prometido vira uma pasta de texto ilegível.
    <blockquote className="mt-4 whitespace-pre-wrap break-words border-l-2 border-accent pl-4 text-[15px] italic text-foreground/90">
      {text}
    </blockquote>
  )
}

function Callout({ text }: { text: string }) {
  return (
    <Card className="mt-4 p-4 text-[15px] leading-relaxed text-foreground">
      {text}
    </Card>
  )
}

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * O anexo. Sem `supabaseUrl` configurada o link some e sobra o nome do arquivo:
 * botão que leva a `undefined/storage/...` é pior que botão nenhum, porque a
 * pessoa clica, falha, e conclui que o presente não existe.
 */
function FileBlock({
  path,
  label,
  sizeBytes,
}: {
  path: string
  label: string
  sizeBytes?: number
}) {
  const href = deliveryFileUrl(path, process.env.SUPABASE_URL)
  const meta = sizeBytes ? formatSize(sizeBytes) : null

  if (!href) {
    return (
      <Card className="mt-4 p-4 text-[15px] text-muted">
        {label}
        {meta ? ` · ${meta}` : ''}
      </Card>
    )
  }

  return (
    <a
      href={href}
      className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border p-4 text-[15px] text-foreground transition-colors duration-150 hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{label}</span>
        {meta && <span className="label block text-[10px] text-muted">{meta}</span>}
      </span>
      <span className="label shrink-0 text-[10px] text-accent">Baixar</span>
    </a>
  )
}

export function DeliveryBlocks({ blocks }: { blocks: DeliveryBlock[] }) {
  return (
    <div>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return <Heading key={index} text={block.text} />
          case 'paragraph':
            return <Paragraph key={index} text={block.text} />
          case 'list':
            return <List key={index} items={block.items} />
          case 'checklist':
            return <Checklist key={index} items={block.items} />
          case 'steps':
            return <Steps key={index} items={block.items} />
          case 'quote':
            return <Quote key={index} text={block.text} />
          case 'callout':
            return <Callout key={index} text={block.text} />
          case 'file':
            return (
              <FileBlock
                key={index}
                path={block.path}
                label={block.label}
                sizeBytes={block.sizeBytes}
              />
            )
        }
      })}
    </div>
  )
}
