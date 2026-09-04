import { describe, expect, it } from 'vitest'
import {
  agruparPorDia,
  apenasValidos,
  baseDeClientes,
  comparativoPeriodo,
  janelaAnterior,
  janelaPeriodo,
  mixPorProduto,
  margemPorCliente,
  mixPorSku,
  noPeriodo,
  porCanal,
  precoRealizadoVsTabela,
  rankingClientes,
  resumo,
  seriePorSemana,
  type PedidoMetrica,
} from './metricas-venda'
import { margemDoPeriodo } from './margem'
import type { FaixaPreco, Produto } from './tipos'

const FAIXAS: FaixaPreco[] = [
  { id: 'b2', sku: '500g', kgMin: 10.001, kgMax: 50, precoUnit: 20, vigenteDesde: '2026-01-01' },
]

/** Dois pedidos de 500g: um no preço de tabela, um com desconto. */
const PEDIDOS: PedidoMetrica[] = [
  {
    data: '2026-07-06',
    clienteId: 'c1',
    clienteNome: 'Hotel Praia',
    canal: 'hotel',
    condicao: 'prazo_30',
    status: 'entregue',
    totalKg: 20,
    totalValor: 800,
    itens: [{ sku: '500g', qtdPacotes: 40, precoUnit: 20, subtotal: 800 }],
  },
  {
    data: '2026-07-14',
    clienteId: 'c2',
    clienteNome: 'Mercadinho Sol',
    canal: 'revenda',
    condicao: 'avista',
    status: 'entregue',
    totalKg: 20,
    totalValor: 720,
    itens: [{ sku: '500g', qtdPacotes: 40, precoUnit: 18, subtotal: 720 }],
  },
  {
    data: '2026-07-20',
    clienteId: 'c2',
    clienteNome: 'Mercadinho Sol',
    canal: 'revenda',
    condicao: 'avista',
    status: 'cancelado',
    totalKg: 100,
    totalValor: 9999,
    itens: [{ sku: '500g', qtdPacotes: 200, precoUnit: 50, subtotal: 9999 }],
  },
]

describe('apenasValidos', () => {
  it('tira pedido cancelado de qualquer metrica', () => {
    expect(apenasValidos(PEDIDOS)).toHaveLength(2)
  })
})

describe('noPeriodo', () => {
  it('filtra pelo intervalo inclusivo', () => {
    expect(noPeriodo(apenasValidos(PEDIDOS), '2026-07-10', '2026-07-31')).toHaveLength(1)
  })
})

describe('resumo', () => {
  it('soma kg, receita, ticket medio e preco medio por kg', () => {
    expect(resumo(apenasValidos(PEDIDOS))).toEqual({
      kg: 40,
      receita: 1520,
      quantidade: 2,
      ticketMedio: 760,
      precoMedioKg: 38,
    })
  })

  it('sem pedido nao divide por zero', () => {
    expect(resumo([])).toEqual({
      kg: 0,
      receita: 0,
      quantidade: 0,
      ticketMedio: 0,
      precoMedioKg: 0,
    })
  })
})

describe('precoRealizadoVsTabela', () => {
  it('expoe o desconto medio concedido', () => {
    // tabela: 80 pacotes x R$20 = 1600 em 40 kg = R$40/kg; realizado = R$38/kg
    expect(precoRealizadoVsTabela(apenasValidos(PEDIDOS), FAIXAS)).toEqual({
      realizadoKg: 38,
      tabelaKg: 40,
      descontoPercentual: 5,
    })
  })

  it('devolve null quando nao ha faixa para comparar', () => {
    expect(precoRealizadoVsTabela(apenasValidos(PEDIDOS), [])).toBeNull()
  })
})

describe('mixPorSku', () => {
  it('devolve pacotes, kg e receita por SKU', () => {
    expect(mixPorSku(apenasValidos(PEDIDOS))).toEqual([
      { sku: '250g', pacotes: 0, kg: 0, receita: 0 },
      { sku: '500g', pacotes: 80, kg: 40, receita: 1520 },
    ])
  })
})

describe('mixPorProduto', () => {
  const PRODUTOS: Produto[] = [
    {
      id: 'prod-500',
      nome: 'Café Torrão 500g',
      descricao: null,
      pesoKg: 0.5,
      fotoUrl: null,
      skuLegado: '500g',
      ativo: true,
      ordem: 2,
    },
  ]

  it('agrupa pelo produto_id e mostra o NOME do produto', () => {
    const pedidos: PedidoMetrica[] = PEDIDOS.map((p) => ({
      ...p,
      itens: p.itens.map((item) => ({ ...item, produtoId: item.sku === '500g' ? 'prod-500' : null })),
    }))
    expect(mixPorProduto(apenasValidos(pedidos), PRODUTOS)).toEqual([
      { produtoId: 'prod-500', nome: 'Café Torrão 500g', pacotes: 80, kg: 40, receita: 1520 },
    ])
  })

  it('registro sem produto_id (so sku) cai no rotulo do sku, nao some da lista', () => {
    // simula um item historico sem produto_id resolvido ainda
    const pedidos: PedidoMetrica[] = [{ ...PEDIDOS[0], itens: [{ sku: '500g', qtdPacotes: 10, precoUnit: 20, subtotal: 200 }] }]
    expect(mixPorProduto(pedidos, [])).toEqual([
      { produtoId: null, nome: '500g', pacotes: 10, kg: 5, receita: 200 },
    ])
  })
})

describe('seriePorSemana', () => {
  it('agrupa por segunda-feira e ordena', () => {
    expect(seriePorSemana(apenasValidos(PEDIDOS))).toEqual([
      { semana: '2026-07-06', kg: 20, receita: 800 },
      { semana: '2026-07-13', kg: 20, receita: 720 },
    ])
  })
})

describe('rankingClientes', () => {
  it('ordena por receita e respeita o limite', () => {
    const ranking = rankingClientes(apenasValidos(PEDIDOS), 1)
    expect(ranking).toEqual([
      { clienteId: 'c1', clienteNome: 'Hotel Praia', kg: 20, receita: 800 },
    ])
  })
})

describe('porCanal', () => {
  it('soma kg e receita por canal, ordenado por receita', () => {
    expect(porCanal(apenasValidos(PEDIDOS))).toEqual([
      { canal: 'hotel', kg: 20, receita: 800 },
      { canal: 'revenda', kg: 20, receita: 720 },
    ])
  })
})

describe('baseDeClientes', () => {
  const historico: PedidoMetrica[] = [
    { ...PEDIDOS[0], data: '2026-06-10', clienteId: 'antigo', clienteNome: 'Bar Velho' },
    { ...PEDIDOS[0], data: '2026-07-10', clienteId: 'antigo', clienteNome: 'Bar Velho' },
    { ...PEDIDOS[0], data: '2026-07-12', clienteId: 'novo', clienteNome: 'Padaria Nova' },
    { ...PEDIDOS[0], data: '2026-06-15', clienteId: 'sumiu', clienteNome: 'Hotel Sumido' },
  ]

  it('conta ativos, novos e perdidos na janela', () => {
    // janela de 30 dias: 2026-07-01 a 2026-07-30; anterior: 2026-06-01 a 2026-06-30
    expect(baseDeClientes(historico, '2026-07-01', '2026-07-30')).toEqual({
      ativos: 2, // antigo e novo
      novos: 1, // novo (primeiro pedido de todos caiu na janela)
      perdidos: 1, // sumiu (comprou na janela anterior e nao voltou)
    })
  })
})

describe('janelaPeriodo', () => {
  it('hoje: janela de um dia so, rotulo Hoje', () => {
    expect(janelaPeriodo('hoje', '2026-08-05')).toEqual({
      inicio: '2026-08-05',
      fim: '2026-08-05',
      rotulo: 'Hoje',
    })
  })

  it('semana: da segunda-feira ate hoje', () => {
    // 2026-08-03 e segunda; 2026-08-05 e quarta
    expect(janelaPeriodo('semana', '2026-08-05')).toEqual({
      inicio: '2026-08-03',
      fim: '2026-08-05',
      rotulo: 'Esta semana',
    })
  })

  it('mes: do dia 1 ate hoje', () => {
    expect(janelaPeriodo('mes', '2026-08-15')).toEqual({
      inicio: '2026-08-01',
      fim: '2026-08-15',
      rotulo: 'Este mês',
    })
  })
})

describe('janelaAnterior', () => {
  it('janela de um dia: anterior e o dia de antes', () => {
    expect(janelaAnterior({ inicio: '2026-08-05', fim: '2026-08-05', rotulo: 'Hoje' })).toEqual({
      inicio: '2026-08-04',
      fim: '2026-08-04',
    })
  })

  it('janela de varios dias: anterior tem o mesmo tamanho, colada antes', () => {
    // janela de 3 dias (03 a 05); anterior tambem tem 3 dias, terminando em 02
    expect(
      janelaAnterior({ inicio: '2026-08-03', fim: '2026-08-05', rotulo: 'Esta semana' }),
    ).toEqual({
      inicio: '2026-07-31',
      fim: '2026-08-02',
    })
  })
})

describe('comparativoPeriodo', () => {
  const HISTORICO: PedidoMetrica[] = [
    {
      data: '2026-08-04',
      clienteId: 'c1',
      clienteNome: 'Padaria Ontem',
      canal: 'revenda',
      condicao: 'avista',
      status: 'entregue',
      totalKg: 10,
      totalValor: 300,
      itens: [],
    },
    {
      data: '2026-08-05',
      clienteId: 'c1',
      clienteNome: 'Padaria Ontem',
      canal: 'revenda',
      condicao: 'avista',
      status: 'entregue',
      totalKg: 15,
      totalValor: 450,
      itens: [],
    },
  ]

  it('hoje vs ontem: soma o dia e compara com o anterior', () => {
    const comparativo = comparativoPeriodo(HISTORICO, 'hoje', '2026-08-05')
    expect(comparativo.atual).toEqual({ kg: 15, receita: 450, quantidade: 1 })
    expect(comparativo.anterior).toEqual({ kg: 10, receita: 300, quantidade: 1 })
    expect(comparativo.variacaoReceitaPct).toBe(50)
    expect(comparativo.variacaoKgPct).toBe(50)
  })

  it('anterior zerado devolve null na variacao — nunca Infinity', () => {
    const soHoje: PedidoMetrica[] = [HISTORICO[1]]
    const comparativo = comparativoPeriodo(soHoje, 'hoje', '2026-08-05')
    expect(comparativo.anterior).toEqual({ kg: 0, receita: 0, quantidade: 0 })
    expect(comparativo.variacaoReceitaPct).toBeNull()
    expect(comparativo.variacaoKgPct).toBeNull()
  })

  it('pedido cancelado fica fora da conta em ambas as janelas', () => {
    const comCancelado: PedidoMetrica[] = [
      ...HISTORICO,
      {
        data: '2026-08-05',
        clienteId: 'c2',
        clienteNome: 'Nao Conta',
        canal: 'revenda',
        condicao: 'avista',
        status: 'cancelado',
        totalKg: 999,
        totalValor: 9999,
        itens: [],
      },
    ]
    const comparativo = comparativoPeriodo(comCancelado, 'hoje', '2026-08-05')
    expect(comparativo.atual).toEqual({ kg: 15, receita: 450, quantidade: 1 })
  })
})

describe('agruparPorDia', () => {
  it('ordena os dias do mais recente para o mais antigo', () => {
    expect(agruparPorDia(PEDIDOS).map((g) => g.dia)).toEqual([
      '2026-07-20',
      '2026-07-14',
      '2026-07-06',
    ])
  })

  it('cancelado entra na lista do dia mas fica fora do subtotal', () => {
    const doDiaCancelado = agruparPorDia(PEDIDOS).find((g) => g.dia === '2026-07-20')
    expect(doDiaCancelado).toEqual({
      dia: '2026-07-20',
      kg: 0,
      valor: 0,
      pedidos: [PEDIDOS[2]],
    })
  })

  it('soma kg e valor só dos pedidos válidos do dia', () => {
    const doDia = agruparPorDia(PEDIDOS).find((g) => g.dia === '2026-07-06')
    expect(doDia).toEqual({ dia: '2026-07-06', kg: 20, valor: 800, pedidos: [PEDIDOS[0]] })
  })

  it('dia sem pedido nao aparece', () => {
    expect(agruparPorDia(PEDIDOS).some((g) => g.dia === '2026-07-10')).toBe(false)
  })

  it('sem pedido nenhum devolve lista vazia', () => {
    expect(agruparPorDia([])).toEqual([])
  })
})
