import { Lock, LockOpen } from 'lucide-react'

import { Badge } from '@/components/ui'

/**
 * Selo da janela de 24h. É informação operacional: quem lê decide se pode
 * mandar DM agora, então o estado NÃO pode depender de cor. São três canais
 * independentes:
 *
 *   1. a palavra — "aberta" / "fechada";
 *   2. o cadeado — glifo diferente, não a mesma forma repintada;
 *   3. o quadrado do `Badge` — success/warning, que é reforço, não o sinal.
 *
 * Fica em `shared/` porque aparece em duas features (contatos e conversas);
 * duplicar o selo era o caminho mais curto para os dois lados divergirem
 * justamente no aviso que não pode ficar ambíguo.
 *
 * O texto do chip sai sempre em `foreground` sobre `surface-2` (15,5:1) —
 * legibilidade independe do tom.
 */
export function WindowBadge({ open }: { open: boolean }) {
  return (
    <Badge tone={open ? 'success' : 'warning'}>
      {open ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
      janela 24h {open ? 'aberta' : 'fechada'}
    </Badge>
  )
}
