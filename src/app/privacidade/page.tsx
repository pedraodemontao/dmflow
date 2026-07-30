import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — dm-flow',
  description: 'Como o dm-flow trata os dados coletados via API do Instagram',
}

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-muted">dm-flow · atualizada em 29 de julho de 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-base font-semibold">O que é o dm-flow</h2>
          <p className="text-muted">
            O dm-flow é uma ferramenta de uso próprio que automatiza respostas a comentários e
            mensagens diretas no Instagram. Ele é operado exclusivamente pelo titular das contas
            conectadas e não é oferecido como serviço a terceiros.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Dados que coletamos</h2>
          <p className="mb-2 text-muted">
            Ao conectar uma conta do Instagram, o dm-flow armazena:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Identificador e nome de usuário da conta profissional conectada</li>
            <li>Token de acesso fornecido pela Meta, usado apenas para operar a automação</li>
            <li>
              Identificador, nome de usuário e nome de exibição de quem interage com a conta por
              comentário ou mensagem
            </li>
            <li>Conteúdo das mensagens trocadas dentro das automações</li>
            <li>Etiquetas e campos que você mesmo define nos fluxos</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Como usamos esses dados</h2>
          <p className="text-muted">
            Os dados são usados unicamente para executar as automações configuradas: identificar
            quem interagiu, enviar a resposta correspondente e manter o histórico da conversa. Não
            vendemos, alugamos nem compartilhamos dados com terceiros, e não usamos esses dados
            para publicidade.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Onde os dados ficam</h2>
          <p className="text-muted">
            Os dados são armazenados em um banco PostgreSQL privado (Supabase), com acesso
            restrito ao operador da ferramenta. O acesso é feito por chave de serviço e as tabelas
            têm segurança em nível de linha habilitada.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Retenção e exclusão</h2>
          <p className="text-muted">
            Os dados são mantidos enquanto a automação estiver em uso. Para solicitar a exclusão
            dos seus dados, envie uma mensagem direta para a conta do Instagram com a qual você
            interagiu, pedindo a remoção — os registros serão apagados do banco. A desconexão da
            conta no Instagram (Configurações → Apps e sites) revoga imediatamente o acesso do
            aplicativo.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Dados da Meta</h2>
          <p className="text-muted">
            O dm-flow usa a API do Instagram fornecida pela Meta e segue os Termos da Plataforma da
            Meta. O uso dos dados obtidos pela API se limita ao funcionamento das automações
            descritas acima.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Contato</h2>
          <p className="text-muted">
            Dúvidas sobre esta política podem ser enviadas por mensagem direta à conta do Instagram
            conectada a esta ferramenta.
          </p>
        </section>
      </div>
    </main>
  )
}
