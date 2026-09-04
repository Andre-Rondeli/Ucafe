import { describe, expect, it } from 'vitest'
import {
  estoqueNoCliente,
  janelaDeVenda,
  oportunidadeFaixa,
  oportunidadeFaixaProduto,
  prever,
  sinais,
  type PedidoHistorico,
} from './recompra'
import type { FaixaProduto } from './preco'
import type { FaixaPreco } from './tipos'

/** Pedidos a cada 10 dias, 20 kg cada. */
const REGULAR: PedidoHistorico[] = [
  { data: '2026-07-04', totalKg: 20 },
  { data: '2026-07-14', totalKg: 20 },
  { data: '2026-07-24', totalKg: 20 },
]

describe('prever', () => {
  it('calcula cadencia, proxima compra e quantidade sugerida', () => {
    const p = prever(REGULAR, null, '2026-07-28')
    expect(p.cadenciaDias).toBe(10)
    expect(p.origemCadencia).toBe('calculada')
    expect(p.proximaCompraPrevista).toBe('2026-08-03')
    expect(p.atrasoDias).toBe(-6) // faltam 6 dias
    expect(p.qtdSugeridaKg).toBe(20)
    expect(p.confianca).toBe('media')
  })

  it('atrasoDias fica positivo quando a previsao ja passou', () => {
    expect(prever(REGULAR, null, '2026-08-10').atrasoDias).toBe(7)
  })

  it('nao depende da ordem dos pedidos na entrada', () => {
    const desordenado = [REGULAR[2], REGULAR[0], REGULAR[1]]
    expect(prever(desordenado, null, '2026-07-28')).toEqual(prever(REGULAR, null, '2026-07-28'))
  })

  it('usa so os ultimos 5 pedidos para a cadencia', () => {
    // 6 pedidos: os 2 primeiros com intervalo de 60 dias, o resto de 10
    const pedidos: PedidoHistorico[] = [
      { data: '2026-01-01', totalKg: 20 },
      { data: '2026-03-01', totalKg: 20 },
      { data: '2026-03-11', totalKg: 20 },
      { data: '2026-03-21', totalKg: 20 },
      { data: '2026-03-31', totalKg: 20 },
      { data: '2026-04-10', totalKg: 20 },
    ]
    expect(prever(pedidos, null, '2026-04-15').cadenciaDias).toBe(10)
    expect(prever(pedidos, null, '2026-04-15').confianca).toBe('alta')
  })

  it('quantidade sugerida usa a media dos ultimos 3', () => {
    const pedidos: PedidoHistorico[] = [
      { data: '2026-07-04', totalKg: 100 },
      { data: '2026-07-14', totalKg: 10 },
      { data: '2026-07-24', totalKg: 20 },
      { data: '2026-08-03', totalKg: 30 },
    ]
    expect(prever(pedidos, null, '2026-08-05').qtdSugeridaKg).toBe(20)
  })

  it('dois pedidos na mesma data (segundo pedido do dia) nao zeram a cadencia', () => {
    const pedidos: PedidoHistorico[] = [
      { data: '2026-07-04', totalKg: 20 },
      { data: '2026-07-14', totalKg: 5 }, // correcao de lancamento no mesmo dia do proximo
      { data: '2026-07-14', totalKg: 20 },
      { data: '2026-07-24', totalKg: 20 },
    ]
    const p = prever(pedidos, null, '2026-07-28')
    expect(p.cadenciaDias).toBe(10)
    expect(p.cadenciaDias).not.toBe(0)
    expect(p.origemCadencia).toBe('calculada')
  })

  it('com 2 pedidos a confianca e baixa', () => {
    expect(prever(REGULAR.slice(0, 2), null, '2026-07-20').confianca).toBe('baixa')
  })

  it('com 1 pedido cai na cadencia declarada', () => {
    const p = prever([{ data: '2026-07-24', totalKg: 15 }], 15, '2026-07-28')
    expect(p.cadenciaDias).toBe(15)
    expect(p.origemCadencia).toBe('declarada')
    expect(p.proximaCompraPrevista).toBe('2026-08-08')
    expect(p.qtdSugeridaKg).toBe(15)
    expect(p.confianca).toBe('sem_historico')
  })

  it('com 1 pedido e sem cadencia declarada nao ha previsao', () => {
    const p = prever([{ data: '2026-07-24', totalKg: 15 }], null, '2026-07-28')
    expect(p.cadenciaDias).toBeNull()
    expect(p.origemCadencia).toBe('nenhuma')
    expect(p.proximaCompraPrevista).toBeNull()
    expect(p.confianca).toBe('sem_historico')
  })

  it('sem nenhum pedido nao inventa numero', () => {
    const p = prever([], 20, '2026-07-28')
    expect(p.proximaCompraPrevista).toBeNull()
    expect(p.qtdSugeridaKg).toBeNull()
    expect(p.confianca).toBe('sem_historico')
  })
})

describe('sinais', () => {
  it('marca na_hora quando a previsao cai em ate 3 dias', () => {
    const hoje = '2026-08-01' // previsao 2026-08-03
    expect(sinais(REGULAR, prever(REGULAR, null, hoje), hoje)).toContain('na_hora')
  })

  it('nao marca na_hora quando ainda falta mais de 3 dias', () => {
    const hoje = '2026-07-26'
    expect(sinais(REGULAR, prever(REGULAR, null, hoje), hoje)).not.toContain('na_hora')
  })

  it('marca em_risco quando passou 1,5x a cadencia', () => {
    const hoje = '2026-08-09' // 16 dias desde 24/07, cadencia 10 -> limite 15
    expect(sinais(REGULAR, prever(REGULAR, null, hoje), hoje)).toContain('em_risco')
  })

  it('marca caindo quando o ultimo pedido fica abaixo de 70% da media anterior', () => {
    const pedidos: PedidoHistorico[] = [
      { data: '2026-07-04', totalKg: 20 },
      { data: '2026-07-14', totalKg: 20 },
      { data: '2026-07-24', totalKg: 10 },
    ]
    const hoje = '2026-07-26'
    expect(sinais(pedidos, prever(pedidos, null, hoje), hoje)).toContain('caindo')
  })

  it('nao marca caindo numa variacao pequena', () => {
    const pedidos: PedidoHistorico[] = [
      { data: '2026-07-04', totalKg: 20 },
      { data: '2026-07-14', totalKg: 20 },
      { data: '2026-07-24', totalKg: 18 },
    ]
    const hoje = '2026-07-26'
    expect(sinais(pedidos, prever(pedidos, null, hoje), hoje)).not.toContain('caindo')
  })

  it('cliente sem historico e novo', () => {
    const pedidos = [{ data: '2026-07-24', totalKg: 15 }]
    expect(sinais(pedidos, prever(pedidos, null, '2026-07-26'), '2026-07-26')).toEqual(['novo'])
  })

  it('cliente com cadencia declarada e atrasado acende na fila, nao fica so como novo', () => {
    const pedidos = [{ data: '2026-06-01', totalKg: 15 }]
    const hoje = '2026-07-31' // 60 dias depois, cadencia declarada de 15
    const previsao = prever(pedidos, 15, hoje)
    const encontrados = sinais(pedidos, previsao, hoje)
    expect(encontrados).toContain('novo')
    expect(encontrados).toContain('na_hora')
    expect(encontrados).toContain('em_risco')
  })

  it('cliente novo sem cadencia declarada continua so como novo', () => {
    const pedidos = [{ data: '2026-06-01', totalKg: 15 }]
    const previsao = prever(pedidos, null, '2026-07-31')
    expect(sinais(pedidos, previsao, '2026-07-31')).toEqual(['novo'])
  })

  it('sem nenhum pedido devolve so novo', () => {
    const previsao = prever([], 15, '2026-07-31')
    expect(sinais([], previsao, '2026-07-31')).toEqual(['novo'])
  })

  it('cliente em dia fica ok', () => {
    const hoje = '2026-07-26'
    expect(sinais(REGULAR, prever(REGULAR, null, hoje), hoje)).toEqual(['ok'])
  })
})

describe('oportunidadeFaixa', () => {
  const FAIXAS: FaixaPreco[] = [
    { id: 'a2', sku: '250g', kgMin: 10.001, kgMax: 50, precoUnit: 11, vigenteDesde: '2026-01-01' },
    { id: 'a3', sku: '250g', kgMin: 50.001, kgMax: null, precoUnit: 10, vigenteDesde: '2026-01-01' },
  ]

  it('diz quantos kg faltam para o preco melhor', () => {
    const o = oportunidadeFaixa(FAIXAS, '250g', 45, '2026-03-01')
    expect(o).toEqual({
      kgFaltando: 5,
      precoAtual: 11,
      precoMelhor: 10,
      economiaPorPacote: 1,
    })
  })

  it('devolve null quando o cliente ja esta na melhor faixa', () => {
    expect(oportunidadeFaixa(FAIXAS, '250g', 80, '2026-03-01')).toBeNull()
  })

  it('devolve null quando nao ha faixa na data', () => {
    expect(oportunidadeFaixa(FAIXAS, '250g', 45, '2025-01-01')).toBeNull()
  })
})

describe('oportunidadeFaixaProduto', () => {
  const FAIXAS_PRODUTO: FaixaProduto[] = [
    { id: 'a2', produtoId: 'p250', kgMin: 10.001, kgMax: 50, precoUnit: 11, vigenteDesde: '2026-01-01' },
    { id: 'a3', produtoId: 'p250', kgMin: 50.001, kgMax: null, precoUnit: 10, vigenteDesde: '2026-01-01' },
  ]

  it('diz quantos kg faltam para o preco melhor', () => {
    const o = oportunidadeFaixaProduto(FAIXAS_PRODUTO, 'p250', 45, '2026-03-01')
    expect(o).toEqual({
      kgFaltando: 5,
      precoAtual: 11,
      precoMelhor: 10,
      economiaPorPacote: 1,
    })
  })

  it('devolve null quando o cliente ja esta na melhor faixa', () => {
    expect(oportunidadeFaixaProduto(FAIXAS_PRODUTO, 'p250', 80, '2026-03-01')).toBeNull()
  })

  it('devolve null quando nao ha faixa na data', () => {
    expect(oportunidadeFaixaProduto(FAIXAS_PRODUTO, 'p250', 45, '2025-01-01')).toBeNull()
  })
})

describe('uma compra é um DIA, não um documento', () => {
  it('duas notas no mesmo dia somam a quantidade em vez de dividir a média', () => {
    // 100 kg num dia e 100 no outro: a sugestão é 100, não 50
    const previsao = prever(
      [
        { data: '2026-08-01', totalKg: 60 },
        { data: '2026-08-01', totalKg: 40 },
        { data: '2026-08-08', totalKg: 100 },
      ],
      null,
      '2026-08-10',
    )
    expect(previsao.qtdSugeridaKg).toBe(100)
  })

  it('e a cadência conta os dias, não os documentos', () => {
    // seis notas em três dias, de 7 em 7: cadência 7, não 3 ou 4
    const previsao = prever(
      [
        { data: '2026-08-01', totalKg: 10 },
        { data: '2026-08-01', totalKg: 10 },
        { data: '2026-08-08', totalKg: 10 },
        { data: '2026-08-08', totalKg: 10 },
        { data: '2026-08-15', totalKg: 10 },
        { data: '2026-08-15', totalKg: 10 },
      ],
      null,
      '2026-08-16',
    )
    expect(previsao.cadenciaDias).toBe(7)
    expect(previsao.origemCadencia).toBe('calculada')
  })

  it('a janela do histórico não é comida pelas duplicatas', () => {
    // 5 documentos em 2 dias + 1 dia antigo: a cadência ainda enxerga o dia antigo
    const previsao = prever(
      [
        { data: '2026-07-01', totalKg: 10 },
        { data: '2026-08-01', totalKg: 10 },
        { data: '2026-08-01', totalKg: 10 },
        { data: '2026-08-01', totalKg: 10 },
        { data: '2026-08-31', totalKg: 10 },
        { data: '2026-08-31', totalKg: 10 },
      ],
      null,
      '2026-09-01',
    )
    // 3 dias: 01/07, 01/08, 31/08 -> intervalos 31 e 30 -> ~30
    expect(previsao.cadenciaDias).toBe(31)
  })
})

describe('janelaDeVenda (semáforo da lista de clientes)', () => {
  const previsao = (cadenciaDias: number | null, atrasoDias: number | null) =>
    ({
      cadenciaDias,
      atrasoDias,
      origemCadencia: 'calculada' as const,
      proximaCompraPrevista: null,
      qtdSugeridaKg: null,
      confianca: 'alta' as const,
    })

  it('verde a partir de 50% do ciclo além do ponto — aqui a ligação vira venda', () => {
    // cadência 30, atraso 15 = 50%
    expect(janelaDeVenda(previsao(30, 15)).cor).toBe('verde')
    expect(janelaDeVenda(previsao(30, 60)).cor).toBe('verde')
  })

  it('amarelo de -10% até 49,99% — dentro do padrão dele', () => {
    expect(janelaDeVenda(previsao(30, 0)).cor).toBe('amarelo') // vence hoje
    expect(janelaDeVenda(previsao(30, 14)).cor).toBe('amarelo') // 46,67%
    expect(janelaDeVenda(previsao(30, -3)).cor).toBe('amarelo') // -10%
  })

  it('vermelho abaixo de -10% — comprou há pouco, ligar é atrapalhar', () => {
    expect(janelaDeVenda(previsao(30, -4)).cor).toBe('vermelho') // -13,3%
    expect(janelaDeVenda(previsao(30, -30)).cor).toBe('vermelho') // comprou hoje
  })

  it('a régua é o ciclo DO CLIENTE, não um número fixo de dias', () => {
    // 5 dias de atraso: urgente para quem compra toda semana, irrelevante para quem
    // compra a cada dois meses
    expect(janelaDeVenda(previsao(7, 5)).cor).toBe('verde')
    expect(janelaDeVenda(previsao(60, 5)).cor).toBe('amarelo')
  })

  it('sem cadência é cinza, não verde — não inventa urgência sem histórico', () => {
    expect(janelaDeVenda(previsao(null, null)).cor).toBe('sem_dado')
    expect(janelaDeVenda(previsao(30, null)).cor).toBe('sem_dado')
  })

  it('o rótulo fala como gente', () => {
    expect(janelaDeVenda(previsao(30, 0)).rotulo).toBe('vence hoje')
    expect(janelaDeVenda(previsao(30, 1)).rotulo).toBe('vencido há 1 dia')
    expect(janelaDeVenda(previsao(30, 12)).rotulo).toBe('vencido há 12 dias')
    expect(janelaDeVenda(previsao(30, -4)).rotulo).toBe('em 4 dias')
  })
})

describe('estoqueNoCliente', () => {
  it('tira da última compra o que ele já consumiu desde então', () => {
    // 30 kg a cada 10 dias = 3 kg/dia; 4 dias depois sobram 18 kg
    const estoque = estoqueNoCliente(
      [
        { data: '2026-01-01', totalKg: 30 },
        { data: '2026-01-11', totalKg: 30 },
        { data: '2026-01-21', totalKg: 30 },
      ],
      null,
      '2026-01-25',
    )
    expect(estoque?.consumoKgDia).toBe(3)
    expect(estoque?.kgEstimado).toBe(18)
    expect(estoque?.diasDeCobertura).toBe(6)
    expect(estoque?.acabouHaDias).toBeNull()
  })

  it('não devolve estoque negativo — devolve há quantos dias acabou', () => {
    const estoque = estoqueNoCliente(
      [
        { data: '2026-01-01', totalKg: 30 },
        { data: '2026-01-11', totalKg: 30 },
        { data: '2026-01-21', totalKg: 30 },
      ],
      null,
      '2026-02-04', // 14 dias depois: 42 kg consumidos de 30
    )
    expect(estoque?.kgEstimado).toBe(0)
    expect(estoque?.diasDeCobertura).toBe(0)
    expect(estoque?.acabouHaDias).toBe(4)
  })

  it('usa a MÉDIA no consumo, não a última compra fora do padrão', () => {
    // médias das 3 últimas: (30+30+90)/3 = 50 kg por ciclo de 10 dias = 5 kg/dia
    const estoque = estoqueNoCliente(
      [
        { data: '2026-01-01', totalKg: 30 },
        { data: '2026-01-11', totalKg: 30 },
        { data: '2026-01-21', totalKg: 90 },
      ],
      null,
      '2026-01-26',
    )
    expect(estoque?.consumoKgDia).toBe(5)
    expect(estoque?.kgEstimado).toBe(65) // 90 − 5×5
  })

  it('sem cadência não estima nada, em vez de chutar', () => {
    expect(estoqueNoCliente([{ data: '2026-01-01', totalKg: 30 }], null, '2026-01-10')).toBeNull()
    expect(estoqueNoCliente([], 10, '2026-01-10')).toBeNull()
  })

  it('duas notas no mesmo dia são UMA compra também aqui', () => {
    const duasNotas = estoqueNoCliente(
      [
        { data: '2026-01-01', totalKg: 30 },
        { data: '2026-01-11', totalKg: 15 },
        { data: '2026-01-11', totalKg: 15 },
      ],
      null,
      '2026-01-13',
    )
    const umaNota = estoqueNoCliente(
      [
        { data: '2026-01-01', totalKg: 30 },
        { data: '2026-01-11', totalKg: 30 },
      ],
      null,
      '2026-01-13',
    )
    expect(duasNotas).toEqual(umaNota)
  })

  it('compra com data no futuro não vira consumo negativo', () => {
    const estoque = estoqueNoCliente(
      [
        { data: '2026-01-01', totalKg: 30 },
        { data: '2026-01-11', totalKg: 30 },
      ],
      null,
      '2026-01-05',
    )
    expect(estoque?.kgEstimado).toBe(30)
  })
})
