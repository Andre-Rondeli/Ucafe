import { useNavigate, useParams } from 'react-router-dom'
import { Carregando, Erro } from '@/componentes/Estado'
import { usePedido } from '@/hooks/usePedido'
import { fardosDeKg, fardosDoItem } from '@/lib/entregas'
import { dataLonga, kgTexto, numeroTexto, reais } from '@/lib/formato'
import { ROTULO_CANAL, ROTULO_CONDICAO } from '@/lib/tipos'
import { MARCA } from '@/lib/marca'

/** Papel, não tela de app: fundo branco fixo, texto preto no impresso, cabe numa folha A4. */
export default function Romaneio() {
  const { id = '' } = useParams()
  const { data: pedido, isLoading, error } = usePedido(id || null)
  const navegar = useNavigate()

  if (isLoading) return <Carregando />
  if (error) return <Erro mensagem={error.message} />
  if (!pedido) return <Erro mensagem="Pedido não encontrado." />

  const numeroPedido = pedido.id.slice(0, 8).toUpperCase()

  return (
    <div className="min-h-screen bg-stone-100 print:bg-white">
      {/* @page fica fora do escopo dos utilitários print: do Tailwind -- inline é o jeito direto de caber em A4 sem tocar CSS global */}
      <style>{'@media print { @page { size: A4; margin: 12mm; } }'}</style>

      <div className="mx-auto max-w-2xl bg-white p-4 text-stone-900 shadow print:max-w-none print:p-0 print:text-black print:shadow-none sm:p-8">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <button type="button" onClick={() => navegar(-1)} className="min-h-11 text-sm text-stone-700 underline">
            ← Voltar
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-lg bg-amber-800 px-4 text-sm font-semibold text-white"
          >
            Imprimir
          </button>
        </div>

        <header className="border-b-2 border-stone-900 pb-3">
          <p className="text-xs uppercase tracking-wide text-stone-600">{MARCA}</p>
          <h1 className="text-xl font-bold uppercase">Romaneio de entrega</h1>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
            <span>
              Pedido nº <strong className="tabular-nums">{numeroPedido}</strong>
            </span>
            <span>
              Data do pedido: <strong>{dataLonga(pedido.data)}</strong>
            </span>
          </div>
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-base font-bold text-amber-900 print:bg-transparent print:p-0 print:text-black">
            Entrega prevista: {dataLonga(pedido.dataEntregaPrevista)}
          </p>
        </header>

        <section className="mt-4 text-sm">
          <p className="font-semibold">{pedido.cliente.nome}</p>
          <p className="text-stone-700 print:text-black">
            {ROTULO_CANAL[pedido.cliente.canal]}
            {pedido.cliente.cidade ? ` · ${pedido.cliente.cidade}` : ''}
            {pedido.cliente.whatsapp ? ` · ${pedido.cliente.whatsapp}` : ''}
          </p>
        </section>

        <section className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-400 text-left">
                <th className="py-1 pr-2">Produto</th>
                <th className="py-1 pr-2 text-right">Pacotes</th>
                <th className="py-1 pr-2 text-right">Fardos</th>
                <th className="py-1 pr-2 text-right">Peso unit.</th>
                <th className="py-1 pr-2 text-right">Peso total</th>
                <th className="py-1 pr-2 text-right">Preço unit.</th>
                <th className="py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((item) => {
                // null quando o peso do pacote não divide o fardo de 5 kg -- "—" em vez de número inventado
                const fardos = fardosDoItem(item.qtdPacotes, item.pesoUnitario)
                return (
                <tr key={item.produtoId} className="border-b border-stone-200">
                  <td className="py-1 pr-2">{item.nome}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{item.qtdPacotes}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {fardos === null ? '—' : numeroTexto(fardos)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{kgTexto(item.pesoUnitario)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{kgTexto(item.pesoTotal)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{reais(item.precoUnit)}</td>
                  <td className="py-1 text-right tabular-nums">{reais(item.subtotal)}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-4 flex items-center justify-between rounded-xl border-2 border-stone-900 p-3">
          {/* fardo primeiro e maior: é a medida que o motorista bate na hora de carregar */}
          <div>
            <p className="text-xs uppercase text-stone-600 print:text-black">Fardos</p>
            <p className="text-2xl font-bold tabular-nums">{numeroTexto(fardosDeKg(pedido.totalKg))}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-stone-600 print:text-black">Peso total</p>
            <p className="text-2xl font-bold tabular-nums">{kgTexto(pedido.totalKg)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-stone-600 print:text-black">Valor total</p>
            <p className="text-lg font-semibold tabular-nums">{reais(pedido.totalValor)}</p>
          </div>
        </section>

        <section className="mt-4 text-sm">
          <p>
            Condição de pagamento: <strong>{ROTULO_CONDICAO[pedido.condicao]}</strong>
          </p>
          {pedido.condicao === 'consignado' && pedido.prazoRetorno && (
            <p className="mt-2 rounded-lg bg-stone-900 p-2 font-semibold text-white print:border print:border-black print:bg-white print:text-black">
              CONSIGNADO — retorno/apuração até {dataLonga(pedido.prazoRetorno)}
            </p>
          )}
        </section>

        {pedido.observacao && (
          <section className="mt-4 text-sm">
            <p className="font-semibold">Observação</p>
            <p className="text-stone-700 print:text-black">{pedido.observacao}</p>
          </section>
        )}

        <section className="mt-10 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="h-16 border-b border-stone-500" />
            <p className="mt-1">Entreguei</p>
          </div>
          <div>
            <div className="h-16 border-b border-stone-500" />
            <p className="mt-1">Recebi — nome e data</p>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-stone-500 print:text-black">
          Documento interno de conferência. Não é documento fiscal.
        </p>
      </div>
    </div>
  )
}
