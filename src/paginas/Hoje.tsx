import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cartao } from '@/componentes/Cartao'
import { Carregando, Erro } from '@/componentes/Estado'
import { useAuth } from '@/hooks/useAuth'
import { useClientes } from '@/hooks/useClientes'
import { useFilaRecompra } from '@/hooks/useFilaRecompra'
import { usePedidos, type PedidoCompleto } from '@/hooks/usePedidos'
import { usePendenciasConsignado } from '@/hooks/usePendenciasConsignado'
import { situacaoPeloPrazo } from '@/lib/consignado'
import { hojeIso } from '@/lib/data'
import { dataLonga, kgTexto, reais } from '@/lib/formato'
import {
  apenasValidos,
  comparativoPeriodo,
  janelaPeriodo,
  resumo,
  type Periodo,
} from '@/lib/metricas-venda'
import { arredondar2 } from '@/lib/numero'
import { ROTULO_CONDICAO } from '@/lib/tipos'

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: 'semana', rotulo: 'Esta semana' },
  { valor: 'mes', rotulo: 'Este mês' },
]

const LABEL_VENDIDO: Record<Periodo, string> = {
  hoje: 'Vendido hoje',
  semana: 'Vendido esta semana',
  mes: 'Vendido este mês',
}

const REFERENCIA_ANTERIOR: Record<Periodo, string> = {
  hoje: 'ontem',
  semana: 'a semana passada',
  mes: 'o mês passado',
}

// O vazio precisa falar do período ESCOLHIDO. Um texto fixo em "hoje" fazia quem
// selecionava "Este mês" ler que não vendeu hoje — e sair sem saber do mês.
const VAZIO_POR_PERIODO: Record<Periodo, string> = {
  hoje: 'Nenhuma venda ainda hoje.',
  semana: 'Nenhuma venda nesta semana.',
  mes: 'Nenhuma venda neste mês.',
}

function IconeSeta({ direcao }: { direcao: 'cima' | 'baixo' }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" aria-hidden="true">
      {direcao === 'cima' ? (
        <path d="M10 4 L16 12 H12 V16 H8 V12 H4 Z" fill="currentColor" />
      ) : (
        <path d="M10 16 L4 8 H8 V4 H12 V8 H16 Z" fill="currentColor" />
      )}
    </svg>
  )
}

/** Sempre com texto explicando a diferença — cor sozinha nunca carrega o recado. */
function Comparacao({
  variacaoNula,
  diferencaReais,
  referencia,
}: {
  variacaoNula: boolean
  diferencaReais: number
  referencia: string
}) {
  if (variacaoNula) {
    return <p className="text-sm text-stone-700">Primeiro período com venda.</p>
  }
  if (diferencaReais === 0) {
    return <p className="text-sm text-stone-700">Igual a {referencia}.</p>
  }
  const positivo = diferencaReais > 0
  return (
    <p
      className={`flex items-center gap-1 text-sm font-medium ${positivo ? 'text-emerald-700' : 'text-red-700'}`}
    >
      <IconeSeta direcao={positivo ? 'cima' : 'baixo'} />
      {reais(Math.abs(diferencaReais))} {positivo ? 'a mais' : 'a menos'} que {referencia}
    </p>
  )
}

export default function Hoje() {
  const { nome } = useAuth()
  const { data: pedidos, isLoading, error } = usePedidos()
  const { data: pendencias } = usePendenciasConsignado()
  const { data: clientes } = useClientes()
  const [periodo, setPeriodo] = useState<Periodo>('hoje')

  const hoje = hojeIso()

  const dados = useMemo(() => {
    const validos = apenasValidos(pedidos ?? [])
    const janela = janelaPeriodo(periodo, hoje)
    const noPeriodo = validos
      .filter((venda) => venda.data >= janela.inicio && venda.data <= janela.fim)
      .sort((a, b) => b.data.localeCompare(a.data))
    // a lista de baixo continua sendo de PEDIDO do app: ela leva para a ficha pelo id, e
    // nota do ERP não tem pedido para abrir
    const pedidosDoPeriodo: PedidoCompleto[] = (pedidos ?? [])
      .filter(
        (p) => p.status !== 'cancelado' && p.data >= janela.inicio && p.data <= janela.fim,
      )
      .sort((a, b) => b.data.localeCompare(a.data))
    return {
      resumoAtual: resumo(noPeriodo),
      notasNoPeriodo: noPeriodo.length - pedidosDoPeriodo.length,
      ultimosPedidos: pedidosDoPeriodo.slice(0, 5),
      comparativo: comparativoPeriodo(validos, periodo, hoje),
    }
  }, [pedidos, periodo, hoje])

  // mesma conta do aviso das 9h e do relatório: um número só, para ninguém precisar
  // conferir qual das telas está certa
  const { vencidos: clientesNaFila } = useFilaRecompra()

  const consignadosAtencao = (pendencias ?? []).filter((p) => {
    const { situacao } = situacaoPeloPrazo(p.prazoRetorno, hoje)
    return situacao === 'vencido' || situacao === 'vence_em_breve'
  }).length

  if (isLoading) return <Carregando />
  if (error) return <Erro mensagem={error.message} />

  const { resumoAtual, ultimosPedidos, comparativo, notasNoPeriodo } = dados
  const semVenda = resumoAtual.quantidade === 0
  const diferencaReais = arredondar2(comparativo.atual.receita - comparativo.anterior.receita)

  return (
    <div className="space-y-6 p-4">
      <div>
        {nome && <p className="text-sm font-medium text-stone-700">Olá, {nome}</p>}
        <p className="text-sm text-stone-700">{dataLonga(hoje)}</p>
      </div>

      {/* O seletor vem ANTES do número. Embaixo, quem não vendeu lia "nenhuma venda" e só
          depois descobria que dava para trocar o período — a resposta aparecia depois da
          pergunta. */}
      <div className="flex gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            type="button"
            aria-pressed={periodo === p.valor}
            onClick={() => setPeriodo(p.valor)}
            className={`min-h-11 flex-1 rounded-full px-3 text-sm font-medium ${
              periodo === p.valor ? 'bg-amber-800 text-white' : 'bg-white text-stone-700'
            }`}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      {semVenda ? (
        <div className="rounded-xl bg-white p-6 text-center shadow">
          <p className="text-stone-700">{VAZIO_POR_PERIODO[periodo]}</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-stone-700">{LABEL_VENDIDO[periodo]}</p>
          <p className="text-4xl font-bold tabular-nums">{reais(resumoAtual.receita)}</p>
          <p className="text-lg font-medium tabular-nums text-stone-700">
            {kgTexto(resumoAtual.kg)}
          </p>
          {/* de onde vem o número: sem isto, quem digitou um pedido não entende por que o
              total é maior que o dele — e desconfia da tela em vez de confiar */}
          <p className="text-xs text-stone-600">
            {ultimosPedidos.length > 0 || notasNoPeriodo > 0
              ? `${resumoAtual.quantidade - notasNoPeriodo} pedido(s) no app + ${notasNoPeriodo} nota(s) do AgroFácil`
              : null}
          </p>
          <div className="mt-1">
            <Comparacao
              variacaoNula={comparativo.variacaoReceitaPct === null}
              diferencaReais={diferencaReais}
              referencia={REFERENCIA_ANTERIOR[periodo]}
            />
          </div>
        </div>
      )}

      <Link
        to="/pedido"
        className="block w-full rounded-xl bg-amber-800 py-4 text-center text-lg font-semibold text-white"
      >
        Lançar pedido
      </Link>

      {!semVenda && (
        <div className="grid grid-cols-3 gap-3">
          <Cartao titulo="Pedidos" valor={String(resumoAtual.quantidade)} />
          <Cartao titulo="Ticket médio" valor={reais(resumoAtual.ticketMedio)} />
          <Cartao titulo="Preço médio" valor={`${reais(resumoAtual.precoMedioKg)}/kg`} />
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Precisa de atenção</h2>
        {consignadosAtencao === 0 && clientesNaFila === 0 ? (
          <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
            Nada pendente hoje.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
            {consignadosAtencao > 0 && (
              <li>
                <Link
                  to="/consignado"
                  className="flex min-h-11 items-center justify-between gap-2 p-3 text-sm"
                >
                  <span>
                    {consignadosAtencao} consignado{consignadosAtencao === 1 ? '' : 's'} vencido
                    {consignadosAtencao === 1 ? '' : 's'} ou vencendo
                  </span>
                  <span className="font-medium text-amber-800">Ver</span>
                </Link>
              </li>
            )}
            {clientesNaFila > 0 && (
              <li>
                <Link
                  to="/recompra"
                  className="flex min-h-11 items-center justify-between gap-2 p-3 text-sm"
                >
                  <span>
                    {clientesNaFila} cliente{clientesNaFila === 1 ? '' : 's'} na hora de recomprar
                  </span>
                  <span className="font-medium text-amber-800">Ver</span>
                </Link>
              </li>
            )}
          </ul>
        )}
      </section>

      {!semVenda && (
        <section>
          <h2 className="mb-1 font-semibold">Últimos pedidos</h2>
          <p className="mb-2 text-xs text-stone-600">
            Só os lançados no app — nota faturada direto no AgroFácil não tem pedido para abrir.
          </p>
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
            {ultimosPedidos.map((pedido) => (
              <li key={pedido.id}>
                <Link
                  to={`/clientes/${pedido.clienteId}`}
                  className="flex min-h-11 items-center justify-between gap-2 p-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{pedido.clienteNome}</span>
                  <span className="shrink-0 text-right tabular-nums text-stone-700">
                    {kgTexto(pedido.totalKg)} · {reais(pedido.totalValor)} ·{' '}
                    {ROTULO_CONDICAO[pedido.condicao]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
