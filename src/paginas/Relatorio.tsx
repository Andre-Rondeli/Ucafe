import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cartao } from '@/componentes/Cartao'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import { useAuth } from '@/hooks/useAuth'
import { useClientes } from '@/hooks/useClientes'
import { usePedidos, type PedidoCompleto } from '@/hooks/usePedidos'
import { useProdutos } from '@/hooks/useProdutos'
import { limitesDoMes } from '@/lib/comissao'
import { addDias, hojeIso } from '@/lib/data'
import { dataLonga, kgTexto, numeroTexto, reais } from '@/lib/formato'
import { margemDoPeriodo, margemDosItens } from '@/lib/margem'
import { agruparPorDia, apenasValidos, noPeriodo, resumo } from '@/lib/metricas-venda'
import { arredondar2 } from '@/lib/numero'
import { KG_POR_SKU, ROTULO_CONDICAO, type CondicaoPagamento } from '@/lib/tipos'

// hojeIso() dentro de cada atalho, nunca em const de módulo: como PWA o app fica
// aberto por dias, e um "Hoje" congelado no carregamento mostraria a venda de ontem
const ATALHOS: { rotulo: string; janela: () => { inicio: string; fim: string } }[] = [
  { rotulo: 'Hoje', janela: () => ({ inicio: hojeIso(), fim: hojeIso() }) },
  { rotulo: 'Últimos 7 dias', janela: () => ({ inicio: addDias(hojeIso(), -6), fim: hojeIso() }) },
  { rotulo: 'Este mês', janela: () => limitesDoMes(hojeIso()) },
  { rotulo: 'Mês passado', janela: () => limitesDoMes(addDias(limitesDoMes(hojeIso()).inicio, -1)) },
]

/** Escapa pra CSV: aspas duplicadas, campo inteiro entre aspas (protege contra ; e quebra de linha no nome). */
function campoCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`
}

function numeroCsv(valor: number): string {
  return valor.toString().replace('.', ',')
}

/** Gera e baixa o CSV — uma linha por item de pedido, só dos pedidos válidos (cancelado nunca entra em exportação de venda). */
function exportarCsv(
  pedidos: PedidoCompleto[],
  produtos: { id: string; nome: string; pesoKg: number }[],
  inicio: string,
  fim: string,
) {
  const linhas = [
    ['Data', 'Entrega prevista', 'Cliente', 'Condição', 'Produto', 'Pacotes', 'Peso (kg)', 'Preço unitário', 'Subtotal'].join(
      ';',
    ),
  ]

  for (const pedido of apenasValidos(pedidos)) {
    for (const item of pedido.itens) {
      const produto = item.produtoId ? produtos.find((p) => p.id === item.produtoId) : undefined
      const nome = produto?.nome ?? item.sku ?? 'Produto removido'
      const pesoUnitario = produto ? produto.pesoKg : item.sku ? KG_POR_SKU[item.sku] : 0
      const pesoLinha = arredondar2(pesoUnitario * item.qtdPacotes)
      linhas.push(
        [
          dataLonga(pedido.data),
          dataLonga(pedido.dataEntregaPrevista),
          campoCsv(pedido.clienteNome),
          campoCsv(ROTULO_CONDICAO[pedido.condicao]),
          campoCsv(nome),
          String(item.qtdPacotes),
          numeroCsv(pesoLinha),
          numeroCsv(item.precoUnit),
          numeroCsv(item.subtotal),
        ].join(';'),
      )
    }
  }

  // BOM UTF-8 explícito -- sem ele o Excel BR abre acento corrompido
  const csv = '\ufeff' + linhas.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `pedidos-${inicio}-a-${fim}.csv`
  // a âncora precisa estar no documento (Firefox ignora click() em nó solto) e a URL só
  // pode ser revogada depois que o download começou -- revogar na mesma linha do click
  // cancela o download em alguns navegadores
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 1000)
}

export default function Relatorio() {
  const { papel } = useAuth()
  const { data: clientes } = useClientes()
  const { data: produtos } = useProdutos()
  const ehAdmin = papel === 'admin'

  const [inicio, setInicio] = useState(() => limitesDoMes(hojeIso()).inicio)
  const [fim, setFim] = useState(() => limitesDoMes(hojeIso()).fim)

  /*
   * Esta é a ÚNICA tela em que a pessoa escolhe qualquer data, inclusive mais antiga que a
   * janela padrão de `usePedidos`. Por isso ela passa o início escolhido: sem isso, pedir
   * um período de três anos atrás devolveria a lista vazia — e uma tela de relatório vazia
   * não parece defeito, parece que não houve venda. Errado e calado é o pior par.
   */
  const { data: pedidos, isLoading, error } = usePedidos(inicio)
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [condicaoFiltro, setCondicaoFiltro] = useState<CondicaoPagamento | ''>('')
  const [mostrarCancelados, setMostrarCancelados] = useState(false)

  const filtrados = useMemo(() => {
    let lista = noPeriodo(pedidos ?? [], inicio, fim)
    if (clienteFiltro) lista = lista.filter((p) => p.clienteId === clienteFiltro)
    if (condicaoFiltro) lista = lista.filter((p) => p.condicao === condicaoFiltro)
    if (!mostrarCancelados) lista = lista.filter((p) => p.status !== 'cancelado')
    return lista
  }, [pedidos, inicio, fim, clienteFiltro, condicaoFiltro, mostrarCancelados])

  const resumoPeriodo = useMemo(() => resumo(apenasValidos(filtrados)), [filtrados])
  const grupos = useMemo(() => agruparPorDia(filtrados), [filtrados])
  const margem = useMemo(() => margemDoPeriodo(apenasValidos(filtrados)), [filtrados])

  if (isLoading) return <Carregando />
  if (error) return <Erro mensagem={error.message} />

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Relatório de pedidos</h1>

      <div className="flex flex-wrap gap-2">
        {ATALHOS.map((atalho) => (
          <button
            key={atalho.rotulo}
            type="button"
            onClick={() => {
              const janela = atalho.janela()
              setInicio(janela.inicio)
              setFim(janela.fim)
            }}
            className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-stone-700 shadow"
          >
            {atalho.rotulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm text-stone-600">
          De
          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
          />
        </label>
        <label className="block text-sm text-stone-600">
          Até
          <input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={clienteFiltro}
          onChange={(e) => setClienteFiltro(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-3 text-sm"
        >
          <option value="">Todos os clientes</option>
          {(clientes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          value={condicaoFiltro}
          onChange={(e) => setCondicaoFiltro(e.target.value as CondicaoPagamento | '')}
          className="rounded-lg border border-stone-300 px-3 py-3 text-sm"
        >
          <option value="">Todas as condições</option>
          {Object.entries(ROTULO_CONDICAO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mostrarCancelados}
          onChange={(e) => setMostrarCancelados(e.target.checked)}
        />
        Mostrar cancelados
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Cartao titulo="Pedidos" valor={String(resumoPeriodo.quantidade)} />
        <Cartao titulo="Volume" valor={kgTexto(resumoPeriodo.kg)} />
        <Cartao titulo="Valor total" valor={reais(resumoPeriodo.receita)} />
        <Cartao titulo="Ticket médio" valor={reais(resumoPeriodo.ticketMedio)} />
      </div>

      {/* custo e margem só para o admin -- e o banco também não deixa o vendedor ler */}
      {ehAdmin && (
        <div className="grid grid-cols-2 gap-3">
          <Cartao
            titulo="Custo"
            valor={margem.completa ? reais(margem.custo) : '—'}
            detalhe={margem.completa ? undefined : 'Falta custo em algum produto'}
          />
          <Cartao
            titulo="Margem"
            valor={margem.margem === null ? '—' : reais(margem.margem)}
            detalhe={
              margem.margemPercentual === null
                ? 'Cadastre o custo dos produtos em Mais → Produtos'
                : `${numeroTexto(margem.margemPercentual)}% da venda`
            }
            alerta={margem.margem !== null && margem.margem < 0}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => exportarCsv(filtrados, produtos ?? [], inicio, fim)}
        disabled={filtrados.length === 0}
        className="w-full min-h-11 rounded-lg border border-stone-300 bg-white py-3 text-sm font-semibold text-stone-700 disabled:opacity-50"
      >
        Exportar CSV
      </button>

      {filtrados.length === 0 ? (
        <Vazio mensagem="Nenhum pedido no período escolhido." />
      ) : (
        <div className="space-y-4">
          {grupos.map((grupo) => (
            <section key={grupo.dia}>
              <div className="flex items-center justify-between rounded-t-xl bg-stone-200 px-3 py-2 text-sm font-semibold">
                <span>{dataLonga(grupo.dia)}</span>
                <span className="tabular-nums">
                  {kgTexto(grupo.kg)} · {reais(grupo.valor)}
                </span>
              </div>
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-b-xl bg-white shadow">
                {grupo.pedidos.map((pedido) => {
                  const cancelado = pedido.status === 'cancelado'
                  const margemPedido = ehAdmin && !cancelado ? margemDosItens(pedido.itens) : null
                  return (
                    <li
                      key={pedido.id}
                      className={`flex items-center justify-between gap-2 p-3 text-sm ${cancelado ? 'text-stone-600' : ''}`}
                    >
                      <span className={cancelado ? 'line-through' : ''}>
                        {pedido.clienteNome} · {ROTULO_CONDICAO[pedido.condicao]}
                        {cancelado && ' · Cancelado'}
                        {margemPedido && (
                          <span className="block text-xs text-stone-600">
                            {margemPedido.margem === null
                              ? 'margem — (sem custo cadastrado)'
                              : `margem ${reais(margemPedido.margem)}${
                                  margemPedido.margemPercentual === null
                                    ? ''
                                    : ` · ${numeroTexto(margemPedido.margemPercentual)}%`
                                }`}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className={cancelado ? 'line-through' : ''}>
                          {kgTexto(pedido.totalKg)} · {reais(pedido.totalValor)}
                        </span>
                        <Link to={`/romaneio/${pedido.id}`} className="text-xs text-stone-600 underline">
                          Romaneio
                        </Link>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
