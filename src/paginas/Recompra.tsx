import { Link } from 'react-router-dom'
import { Cartao } from '@/componentes/Cartao'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import { useFilaRecompra } from '@/hooks/useFilaRecompra'
import { dataLonga, diasTexto, kgTexto } from '@/lib/formato'
import { limparWhatsapp, type ItemFila } from '@/lib/fila-recompra'

/**
 * Relatório de recompra: quem já devia ter comprado, com nome, atraso e o que oferecer.
 *
 * É esta tela que o aviso das 9h abre. Antes ele caía na lista de CADASTRO de clientes,
 * onde a informação existia mas espalhada — um semáforo colorido por linha, misturado com
 * o formulário de cadastro e a busca. Quem recebia "6 clientes na hora de recomprar"
 * tinha de percorrer a carteira inteira procurando quais eram os seis.
 *
 * A régua é a mesma do aviso (`montarFila`), então o número do celular e o desta tela
 * batem. Cada linha já traz o gesto seguinte junto: WhatsApp, pedido novo e ficha.
 */

function ConfiancaBaixa({ item }: { item: ItemFila }) {
  if (item.confianca === 'alta' || item.confianca === 'media') return null
  return (
    <span className="text-stone-500">
      {' · '}
      {item.confianca === 'sem_historico'
        ? 'previsão pela cadência informada'
        : 'poucas compras — previsão fraca'}
    </span>
  )
}

function LinhaCliente({ item, vencido }: { item: ItemFila; vencido: boolean }) {
  const zap = item.whatsapp ? limparWhatsapp(item.whatsapp) : ''
  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/clientes/${item.clienteId}`} className="font-medium underline">
            {item.clienteNome}
          </Link>
          {item.cidade && <p className="truncate text-xs text-stone-600">{item.cidade}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            vencido ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'
          }`}
        >
          {item.atrasoDias > 0
            ? `Atrasado ${diasTexto(item.atrasoDias)}`
            : item.atrasoDias === 0
              ? 'Vence hoje'
              : `Vence em ${diasTexto(-item.atrasoDias)}`}
        </span>
      </div>

      {/* o argumento da ligação, em uma linha: quanto pedir e por quê */}
      <p className="mt-1 text-sm tabular-nums text-stone-800">
        {item.sugestaoKg === null ? 'Sem quantidade típica' : <>Sugerir <strong>{kgTexto(item.sugestaoKg)}</strong></>}
        {item.estoque &&
          (item.estoque.acabouHaDias === null
            ? ` · ≈ ${kgTexto(item.estoque.kgEstimado)} na prateleira dele`
            : ` · prateleira vazia há ${diasTexto(item.estoque.acabouHaDias)}`)}
      </p>

      <p className="text-xs tabular-nums text-stone-600">
        Última compra {dataLonga(item.ultimaCompra)} · {kgTexto(item.kgUltimo)}
        {item.cadenciaDias !== null && ` · compra a cada ${diasTexto(item.cadenciaDias)}`}
        <ConfiancaBaixa item={item} />
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {zap ? (
          <a
            href={`https://wa.me/${zap}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white"
          >
            WhatsApp
          </a>
        ) : (
          // sem número não dá para ligar dali — dizer isso é melhor do que um botão morto
          <span className="flex min-h-11 items-center text-xs text-stone-500">
            Sem WhatsApp no cadastro
          </span>
        )}
        <Link
          to="/pedido"
          className="flex min-h-11 items-center rounded-lg bg-amber-800 px-3 text-sm font-semibold text-white"
        >
          Novo pedido
        </Link>
        <Link
          to={`/clientes/${item.clienteId}`}
          className="flex min-h-11 items-center rounded-lg border border-stone-300 px-3 text-sm"
        >
          Ficha
        </Link>
      </div>
    </li>
  )
}

export default function Recompra() {
  const { fila, isLoading, error } = useFilaRecompra()

  if (isLoading) return <Carregando texto="Montando a fila de recompra…" />
  if (error) return <Erro mensagem={error.message} />

  const { vencidos, aVencer, semPrevisao } = fila

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold">Na hora de recomprar</h1>
        <p className="mt-1 text-sm text-stone-700">
          Quem passou da data prevista pelo ritmo dele, do mais atrasado para o menos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Cartao titulo="Atrasados" valor={String(vencidos.length)} alerta={vencidos.length > 0} />
        <Cartao
          titulo="Vencem em breve"
          valor={String(aVencer.length)}
          detalhe="hoje ou nos próximos 3 dias"
        />
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Ligar agora</h2>
        {vencidos.length === 0 ? (
          <Vazio mensagem="Ninguém atrasado. Toda a carteira está dentro do ritmo dela." />
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
            {vencidos.map((item) => (
              <LinhaCliente key={item.clienteId} item={item} vencido />
            ))}
          </ul>
        )}
      </section>

      {aVencer.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Prepare a próxima</h2>
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
            {aVencer.map((item) => (
              <LinhaCliente key={item.clienteId} item={item} vencido={false} />
            ))}
          </ul>
        </section>
      )}

      {semPrevisao.length > 0 && (
        // não é fila: é o que a conta NÃO alcança. Dizer quem ficou de fora evita a
        // conclusão de que a lista acima é a carteira inteira.
        <section>
          <h2 className="mb-1 font-semibold">Sem ritmo conhecido ainda</h2>
          <p className="text-sm text-stone-700">
            {semPrevisao.length} cliente(s) compraram uma vez só e não têm cadência informada — não
            dá para prever a recompra deles. Informe "compra a cada quantos dias" no cadastro e eles
            entram na fila:{' '}
            {semPrevisao.map((cliente, indice) => (
              <span key={cliente.clienteId}>
                {indice > 0 && ', '}
                <Link to={`/clientes/${cliente.clienteId}`} className="underline">
                  {cliente.clienteNome}
                </Link>
              </span>
            ))}
            .
          </p>
        </section>
      )}
    </div>
  )
}
