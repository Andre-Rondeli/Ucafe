import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Carregando, Erro } from '@/componentes/Estado'
import { useAuth } from '@/hooks/useAuth'
import { useClientes, type Cliente } from '@/hooks/useClientes'
import { useCriarPedido } from '@/hooks/usePedidos'
import { usePrecosCliente } from '@/hooks/usePrecosCliente'
import { usePrecosProdutos } from '@/hooks/usePrecos'
import { useProdutos } from '@/hooks/useProdutos'
import { filtrarPorTexto } from '@/lib/busca'
import { addDias, hojeIso } from '@/lib/data'
import { traduzirErro } from '@/lib/erros'
import { dataLonga, horaCurta, kgTexto, numeroTexto, reais } from '@/lib/formato'
import { arredondar2, precoDigitado } from '@/lib/numero'
import { precoClienteVigente } from '@/lib/preco'
import {
  ehMultiploValido,
  kgMaisProximos,
  kgTotalProdutos,
  MULTIPLO_KG,
  pacotesPorCaixa,
  precificarProdutos,
  totalPedidoProdutos,
  validarItensCaixa,
  type FaixaProduto,
  type ItemProdutoInput,
  type ItemProdutoPrecificado,
} from '@/lib/preco'
import { vencimentos } from '@/lib/prazo'
import { oportunidadeFaixaProduto } from '@/lib/recompra'
import { ROTULO_CONDICAO, type CondicaoPagamento, type Produto } from '@/lib/tipos'

/** Placeholder neutro quando o produto não tem foto — mesmo desenho da tela de Produtos. */
function FotoMiniatura({ produto }: { produto: Produto }) {
  if (produto.fotoUrl) {
    return (
      <img
        src={produto.fotoUrl}
        alt={`Foto do produto ${produto.nome}`}
        loading="lazy"
        className="aspect-square h-12 w-12 shrink-0 rounded-lg object-cover sm:h-14 sm:w-14"
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`${produto.nome} — sem foto`}
      className="flex aspect-square h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400 sm:h-14 sm:w-14"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <rect x="5" y="8" width="14" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 8 V6 a4 4 0 0 1 8 0 v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </div>
  )
}

/**
 * Escolher o cliente com busca, em vez de um `select` de rolar.
 *
 * Com 29 clientes o `select` do navegador já era rolagem; a importação do AgroFácil traz
 * mais, e no celular a lista vira um rolo antes de CADA venda. Aqui a pessoa digita um
 * pedaço do nome ou da cidade e toca — e a busca ignora acento, que é o que faz "sao
 * gabriel" achar "São Gabriel" (ver `src/lib/busca.ts`).
 *
 * Depois de escolhido, a lista some e sobra o nome escolhido com um "Trocar": tela de
 * pedido é para lançar pedido, não para ficar olhando lista de cliente.
 */
function EscolherCliente({
  clientes,
  clienteId,
  onEscolher,
}: {
  clientes: Cliente[]
  clienteId: string
  onEscolher: (id: string) => void
}) {
  const [busca, setBusca] = useState('')
  const escolhido = clientes.find((c) => c.id === clienteId) ?? null

  const achados = useMemo(
    () => filtrarPorTexto(clientes, busca, (c) => [c.nome, c.cidade]),
    [clientes, busca],
  )

  if (escolhido) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{escolhido.nome}</p>
          {escolhido.cidade && <p className="text-xs text-stone-600">{escolhido.cidade}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            onEscolher('')
            setBusca('')
          }}
          className="flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-amber-800 underline"
        >
          Trocar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm text-stone-600">
        Cliente
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome ou pela cidade…"
          autoCapitalize="none"
          autoCorrect="off"
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
        />
      </label>
      <ul className="max-h-64 divide-y divide-stone-200 overflow-y-auto overscroll-contain rounded-lg border border-stone-300 bg-white">
        {achados.length === 0 ? (
          <li className="p-3 text-sm text-stone-700">
            Nenhum cliente ativo com esse nome ou cidade.
          </li>
        ) : (
          achados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onEscolher(c.id)}
                className="flex min-h-11 w-full flex-col items-start justify-center px-3 py-2 text-left"
              >
                <span className="font-medium">{c.nome}</span>
                {c.cidade && <span className="text-xs text-stone-600">{c.cidade}</span>}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

/**
 * Quantidade em FARDOS e em PACOTES, sempre as duas juntas — o cliente pede
 * "30 fardos" e o vendedor digita 30 sem fazer conta. A fonte de verdade é o
 * total de pacotes; o campo de fardos é a mesma quantidade dividida pelo fardo
 * (5 kg ÷ peso do pacote). Os botões −/+ andam de fardo em fardo.
 */
function ControleQuantidade({
  valor,
  passo,
  onChange,
}: {
  valor: string
  /** Pacotes por fardo de 5 kg: os botões andam de fardo em fardo, nunca de 1 em 1. */
  passo: number
  onChange: (novo: string) => void
}) {
  const numero = Number(valor) || 0
  // se o valor digitado está fora da grade, − e + arredondam pro fardo vizinho
  const anterior = Math.max(0, (Math.ceil(numero / passo) - 1) * passo)
  const proximo = (Math.floor(numero / passo) + 1) * passo
  // pacotes quebrados dão fardo fracionado (1,5) — aparece assim mesmo, o aviso
  // de caixa embaixo já explica; some ao digitar de novo
  const fardos = numero === 0 ? '' : String(Math.round((numero / passo) * 100) / 100).replace('.', ',')
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(anterior === 0 ? '' : String(anterior))}
        aria-label={`Diminuir um fardo (${passo} pacotes)`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-stone-300 text-lg font-semibold text-stone-700"
      >
        −
      </button>
      <label className="text-center text-[11px] leading-tight text-stone-600">
        Fardos
        <input
          type="text"
          inputMode="decimal"
          value={fardos}
          onChange={(e) => {
            const digitado = e.target.value.trim().replace(',', '.')
            if (digitado === '') return onChange('')
            const n = Number(digitado)
            if (!Number.isFinite(n) || n < 0) return
            onChange(String(Math.round(n * passo)))
          }}
          className="block h-11 w-14 rounded-lg border border-stone-300 text-center text-lg text-stone-900"
        />
      </label>
      <label className="text-center text-[11px] leading-tight text-stone-600">
        Pacotes
        <input
          type="number"
          min={0}
          step={passo}
          inputMode="numeric"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="block h-11 w-14 rounded-lg border border-stone-300 text-center text-lg text-stone-900"
        />
      </label>
      <button
        type="button"
        onClick={() => onChange(String(proximo))}
        aria-label={`Aumentar um fardo (${passo} pacotes)`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-stone-300 text-lg font-semibold text-stone-700"
      >
        +
      </button>
    </div>
  )
}

export default function NovoPedido() {
  const { data: clientes, isLoading: carregandoClientes, error: erroClientes } = useClientes()
  const { data: produtos, isLoading: carregandoProdutos, error: erroProdutos } = useProdutos()
  const { data: faixas, isLoading: carregandoPrecos, error: erroPrecos } = usePrecosProdutos()
  const { papel } = useAuth()
  const criar = useCriarPedido()
  const navegar = useNavigate()

  const [clienteId, setClienteId] = useState('')
  const [data, setData] = useState(hojeIso())
  // entrega prevista acompanha a data do pedido (mesmo dia é o caso comum), mas o
  // vendedor pode ajustar antes de salvar
  const [dataEntrega, setDataEntrega] = useState(hojeIso())
  useEffect(() => {
    setDataEntrega(data)
  }, [data])
  const [quantidades, setQuantidades] = useState<Record<string, string>>({})
  const [condicao, setCondicao] = useState<CondicaoPagamento | ''>('')
  const [observacao, setObservacao] = useState('')
  const [ajustando, setAjustando] = useState(false)
  const [precosManuais, setPrecosManuais] = useState<Record<string, string>>({})
  const [salvo, setSalvo] = useState<string | null>(null)

  const cliente = (clientes ?? []).find((c) => c.id === clienteId) ?? null
  // preço combinado com ESTE cliente: vence a faixa de kg quando existe
  const { data: precosDoCliente } = usePrecosCliente(clienteId || null)
  const condicaoEfetiva: CondicaoPagamento = condicao || cliente?.condicaoPadrao || 'avista'

  // prazo padrão do retorno/apuração: recalcula sempre que troca o cliente ou a data,
  // mas o vendedor pode ajustar a mão antes de salvar
  const [prazoRetorno, setPrazoRetorno] = useState(() => addDias(data, cliente?.prazoConsignadoDias ?? 30))
  useEffect(() => {
    setPrazoRetorno(addDias(data, cliente?.prazoConsignadoDias ?? 30))
  }, [data, cliente?.id, cliente?.prazoConsignadoDias])

  const produtosAtivos = useMemo(() => (produtos ?? []).filter((p) => p.ativo), [produtos])

  const itensInput: ItemProdutoInput[] = produtosAtivos
    .map((p) => ({ produtoId: p.id, qtdPacotes: Number(quantidades[p.id]) || 0 }))
    .filter((item) => item.qtdPacotes > 0)

  const calculo = useMemo(() => {
    if (!faixas || !produtos || itensInput.length === 0) return null
    try {
      // o preço combinado com o cliente vence a faixa de kg — ver src/lib/preco.ts
      const daTabela = precificarProdutos(itensInput, produtos, faixas, data, precosDoCliente ?? [])
      const itens: ItemProdutoPrecificado[] = daTabela.map((item) => {
        if (!ajustando) return item
        const { valor } = precoDigitado(precosManuais[item.produtoId] ?? '')
        if (valor === null) return item
        return {
          ...item,
          precoUnit: valor,
          subtotal: arredondar2(valor * item.qtdPacotes),
        }
      })
      return { itens, total: totalPedidoProdutos(itens, produtos), tabela: daTabela }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : 'Erro no cálculo' } as const
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    faixas,
    produtos,
    JSON.stringify(itensInput),
    data,
    ajustando,
    JSON.stringify(precosManuais),
    JSON.stringify(precosDoCliente),
  ])

  const kg = produtos ? kgTotalProdutos(itensInput, produtos) : 0

  // a caixa fecha POR PRODUTO: 5 pacotes de 250g (1,25 kg) nao existe na operacao
  const erroCaixa = produtos ? validarItensCaixa(itensInput, produtos) : null

  // preço digitado que não é preço não pode passar calado: trava o salvamento e diz o quê
  const erroPrecoManual = ajustando
    ? (itensInput
        .map((item) => precoDigitado(precosManuais[item.produtoId] ?? '').erro)
        .find((erro) => erro !== null) ?? null)
    : null

  // oportunidade pelo produto de MAIOR PESO presente no pedido — é o que mais pesa na faixa
  const produtoDeMaiorPeso = useMemo(() => {
    if (itensInput.length === 0 || !produtos) return null
    return itensInput.reduce<{ produtoId: string; pesoKg: number } | null>((melhor, item) => {
      const produto = produtos.find((p) => p.id === item.produtoId)
      if (!produto) return melhor
      if (!melhor || produto.pesoKg > melhor.pesoKg) return { produtoId: item.produtoId, pesoKg: produto.pesoKg }
      return melhor
    }, null)
  }, [itensInput, produtos])

  const oportunidade = useMemo(() => {
    if (!faixas || !produtoDeMaiorPeso || kg <= 0) return null
    // com preço combinado a faixa não se aplica: prometer desconto por volume seria mentira
    if (precoClienteVigente(precosDoCliente ?? [], produtoDeMaiorPeso.produtoId, data) !== null) return null
    return oportunidadeFaixaProduto(faixas as FaixaProduto[], produtoDeMaiorPeso.produtoId, kg, data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faixas, produtoDeMaiorPeso, kg, data, JSON.stringify(precosDoCliente)])

  const nomeProduto = (produtoId: string) => produtos?.find((p) => p.id === produtoId)?.nome ?? produtoId

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!calculo || 'erro' in calculo || erroPrecoManual || erroCaixa) return
    const id = await criar.mutateAsync({
      clienteId,
      data,
      condicao: condicaoEfetiva,
      // pedido lançado é entrega PENDENTE até o motorista confirmar na tela Entregas.
      // Nenhum número muda por isso: métrica e comissão excluem só `cancelado`.
      status: 'aberto',
      observacao: observacao.trim() || null,
      totalKg: calculo.total.totalKg,
      totalValor: calculo.total.totalValor,
      itens: calculo.itens,
      prazoRetorno: condicaoEfetiva === 'consignado' ? prazoRetorno : null,
      dataEntregaPrevista: dataEntrega,
    })
    setSalvo(id)
    setQuantidades({})
    setPrecosManuais({})
    setObservacao('')
    setAjustando(false)
  }

  if (carregandoClientes || carregandoProdutos || carregandoPrecos) return <Carregando />
  if (erroClientes) return <Erro mensagem={erroClientes.message} />
  if (erroProdutos) return <Erro mensagem={erroProdutos.message} />
  if (erroPrecos) return <Erro mensagem={erroPrecos.message} />

  const ativos = (clientes ?? []).filter((c) => c.ativo)

  return (
    <form onSubmit={enviar} className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Novo pedido</h1>

      <EscolherCliente
        clientes={ativos}
        clienteId={clienteId}
        onEscolher={(id) => {
          setClienteId(id)
          setCondicao('')
          setSalvo(null)
        }}
      />

      {/* rotulado como os outros: eram dois seletores de data um debaixo do outro e só o
          de baixo tinha nome — quem não é técnico não adivinha qual é qual */}
      <label className="block text-sm text-stone-600">
        Data do pedido
        <input
          type="date"
          required
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
        />
      </label>

      <label className="block text-sm text-stone-600">
        Entrega prevista
        <input
          type="date"
          required
          value={dataEntrega}
          onChange={(e) => setDataEntrega(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
        />
      </label>

      {produtosAtivos.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Nenhum produto ativo cadastrado. Cadastre em Mais → Produtos antes de lançar um pedido.
        </p>
      ) : (
        <ul className="space-y-2">
          {produtosAtivos.map((produto) => {
            const item = calculo && !('erro' in calculo) ? calculo.itens.find((i) => i.produtoId === produto.id) : null
            const caixa = pacotesPorCaixa(produto.pesoKg)
            return (
              <li key={produto.id} className="rounded-xl bg-white p-3 shadow">
                <div className="flex items-center gap-3">
                  <FotoMiniatura produto={produto} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{produto.nome}</p>
                    <p className="text-xs text-stone-600">
                      {kgTexto(produto.pesoKg)} por pacote
                      {caixa !== null && ` · fardo com ${caixa} (5 kg)`}
                    </p>
                    {item && (
                      <p className="mt-1 text-sm tabular-nums text-stone-700">
                        {caixa !== null && item.qtdPacotes % caixa === 0 && (
                          <>{item.qtdPacotes / caixa} fardo(s) · </>
                        )}
                        {item.qtdPacotes} × {reais(item.precoUnit)} ={' '}
                        <strong>{reais(item.subtotal)}</strong>
                        {item.origem === 'cliente' && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                            preço combinado
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <ControleQuantidade
                    valor={quantidades[produto.id] ?? ''}
                    passo={caixa ?? 1}
                    onChange={(v) => setQuantidades({ ...quantidades, [produto.id]: v })}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="rounded-xl bg-white p-4 shadow">
        <p className="text-sm text-stone-700">Volume do pedido</p>
        <p className="text-2xl font-bold tabular-nums">
          {kgTexto(kg)}
          {kg > 0 && ehMultiploValido(kg) && (
            <span className="ml-2 text-base font-medium text-stone-600">
              · {kg / MULTIPLO_KG} fardo{kg / MULTIPLO_KG === 1 ? '' : 's'}
            </span>
          )}
        </p>

        {erroCaixa && (
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{erroCaixa}</p>
        )}

        {!erroCaixa && kg > 0 && !ehMultiploValido(kg) && (
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {(() => {
              const { abaixo, acima } = kgMaisProximos(kg)
              if (abaixo === null) {
                return `${kgTexto(kg)} não fecha caixa. O mínimo é ${kgTexto(acima)}.`
              }
              return `${kgTexto(kg)} não fecha caixa. O pedido é sempre em múltiplo de 5 kg — ajuste para ${kgTexto(abaixo)} ou ${kgTexto(acima)}.`
            })()}
          </p>
        )}

        {calculo && 'erro' in calculo && <p className="mt-2 text-sm text-red-700">{calculo.erro}</p>}

        {calculo && !('erro' in calculo) && (
          <>
            <p className="mt-3 text-2xl font-bold tabular-nums">{reais(calculo.total.totalValor)}</p>
            {vencimentos(data, condicaoEfetiva, calculo.total.totalValor).length > 0 && (
              <p className="text-sm text-stone-700">
                Previsto entrar:{' '}
                {vencimentos(data, condicaoEfetiva, calculo.total.totalValor)
                  .map((v) => `${reais(v.valor)} em ${dataLonga(v.data)}`)
                  .join(' · ')}
              </p>
            )}
          </>
        )}

        {oportunidade && produtoDeMaiorPeso && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm tabular-nums text-amber-900">
            Faltam {kgTexto(oportunidade.kgFaltando)} para o pacote de{' '}
            {nomeProduto(produtoDeMaiorPeso.produtoId)} cair de {reais(oportunidade.precoAtual)} para{' '}
            {reais(oportunidade.precoMelhor)}.
          </p>
        )}
      </div>

      <select
        value={condicaoEfetiva}
        onChange={(e) => setCondicao(e.target.value as CondicaoPagamento)}
        className="w-full rounded-lg border border-stone-300 px-3 py-3"
      >
        {Object.entries(ROTULO_CONDICAO).map(([valor, rotulo]) => (
          <option key={valor} value={valor}>
            {rotulo}
          </option>
        ))}
      </select>

      {condicaoEfetiva === 'consignado' && (
        <label className="block text-sm text-stone-600">
          Retorno/apuração até
          <input
            type="date"
            required
            value={prazoRetorno}
            onChange={(e) => setPrazoRetorno(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
          />
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ajustando} onChange={(e) => setAjustando(e.target.checked)} />
        Ajustar preço manualmente
      </label>

      {ajustando && (
        <div className="space-y-2 rounded-xl bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            O desconto concedido aparece no painel como preço realizado abaixo da tabela.
          </p>
          {itensInput.length === 0 ? (
            <p className="text-sm text-amber-900">Escolha a quantidade de um produto para ajustar o preço.</p>
          ) : (
            itensInput.map((item) => {
              const { erro } = precoDigitado(precosManuais[item.produtoId] ?? '')
              return (
                <label key={item.produtoId} className="block text-sm">
                  Preço do {nomeProduto(item.produtoId)}
                  {/* texto + inputMode decimal (não type=number): é assim que o resto do app
                      aceita vírgula, que é como se digita preço no Brasil */}
                  <input
                    inputMode="decimal"
                    placeholder="10,50"
                    value={precosManuais[item.produtoId] ?? ''}
                    onChange={(e) => setPrecosManuais({ ...precosManuais, [item.produtoId]: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
                  />
                  {erro && <span className="mt-1 block text-red-700">{erro}</span>}
                </label>
              )
            })
          )}
        </div>
      )}

      <textarea
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        placeholder="Observação (opcional)"
        className="w-full rounded-lg border border-stone-300 px-3 py-3"
      />

      {criar.error && <Erro mensagem={criar.error.message} />}

      {salvo ? (
        <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">Pedido salvo.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navegar(`/romaneio/${salvo}`)}
              className="min-h-11 rounded-lg bg-amber-800 py-3 text-sm font-semibold text-white"
            >
              Gerar romaneio
            </button>
            <button
              type="button"
              onClick={() => setSalvo(null)}
              className="min-h-11 rounded-lg border border-stone-300 bg-white py-3 text-sm font-semibold text-stone-700"
            >
              Lançar outro pedido
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={
            !clienteId ||
            itensInput.length === 0 ||
            !ehMultiploValido(kg) ||
            erroCaixa !== null ||
            erroPrecoManual !== null ||
            criar.isPending
          }
          className="w-full rounded-lg bg-amber-800 py-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          {criar.isPending ? 'Salvando…' : 'Salvar pedido'}
        </button>
      )}
    </form>
  )
}
