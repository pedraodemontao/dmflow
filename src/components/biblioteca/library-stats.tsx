import { Card } from '@/components/ui'
import { BigNumber, Meter } from '@/components/ui/chart'

import { compact, percent, type LibrarySummary } from './format'

/**
 * A faixa de números do topo.
 *
 * A referência do dono trazia quatro números do mesmo tamanho: conteúdos,
 * views, outliers e engajamento. Quatro números iguais não hierarquizam nada —
 * o olho não sabe por onde começar e a faixa vira enfeite. Aqui um deles é o
 * protagonista e os outros três são contexto, porque a tela só existe para
 * responder uma pergunta: **o que vale modelar no próximo vídeo?**
 *
 * O número que responde isso é a contagem de DESTAQUES (quantos passaram de
 * 1,5× a mediana do próprio perfil), não o tamanho do acervo. "312 conteúdos"
 * é inventário; "9 valem modelar" é a fila de trabalho de hoje. Por isso ele
 * vem sozinho no primeiro cartão, em `size="lg"`, com a barra de proporção
 * embaixo — e os três de contexto dividem uma tira de fio de cabelo ao lado.
 *
 * "Plays mapeados" e não "views mapeadas", ao contrário da referência: o
 * Instagram devolve as duas contagens e elas divergem em ordem de grandeza
 * (4.719 contra 112.806 no mesmo vídeo). Plays é o número público do reel e a
 * régua sobre a qual o outlier é calculado; misturar as duas faria dois
 * indicadores lado a lado falarem de bases diferentes.
 */
export function LibraryStats({ summary }: { summary: LibrarySummary }) {
  const { total, plays, destaques, semRegua, engagement } = summary
  const proporcao = total === 0 ? 0 : destaques / total

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
      <Card className="p-5">
        <BigNumber
          size="lg"
          value={destaques}
          label="Vale modelar"
          hint={
            <>
              Passaram de 1,5× a mediana de plays do próprio perfil. É a régua que importa: plays
              absolutos ranqueiam tamanho de audiência, e tamanho de audiência não é replicável.
            </>
          }
        />

        {/* A barra responde o que o número sozinho esconde: 9 destaques em 40
            conteúdos é uma biblioteca boa; 9 em 900 é uma raspagem que trouxe
            volume e pouca coisa aproveitável. */}
        <div className="mt-4">
          <Meter
            value={proporcao}
            tone="accent"
            aria-label={`${destaques} de ${total} conteúdos passaram do limite de outlier`}
          />
          <p className="label mt-2 text-[9px] text-muted tabular-nums">
            {destaques} de {total} no recorte
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid h-full divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <BigNumber
              value={total}
              label="Conteúdos"
              hint={
                semRegua > 0
                  ? `${semRegua} ainda sem régua de outlier — perfil com amostra curta demais.`
                  : 'Todos com multiplicador calculado.'
              }
            />
          </div>

          <div className="p-5">
            <BigNumber
              value={compact(plays)}
              label="Plays mapeados"
              hint="Plays, não views: é a contagem que aparece publicamente no reel."
            />
          </div>

          <div className="p-5">
            <BigNumber
              value={percent(engagement)}
              label="Engajamento médio"
              hint="(curtidas + comentários) ÷ plays. Sobre alcance, não sobre seguidores."
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
