import { describe, expect, it } from 'vitest'
import {
  diasParado,
  diasRestantes,
  pendenciaConsignado,
  previsaoReposicao,
  saldoKg,
  saldoPorSku,
  situacaoPeloPrazo,
  previsaoReposicaoProduto,
  saldoKgProduto,
  saldoPorProduto,
  valorSaldoConsignado,
  vendaApuradaDiariaKg,
  type MovConsignado,
  type MovConsignadoProduto,
} from './consignado'
import type { FaixaProduto } from './preco'

/** Entrega de 40 pacotes de 500g (20 kg) e 10 kg já apurados em 20 dias. */
const MOVS: MovConsignado[] = [
  { sku: '500g', tipo: 'entrega', qtdPacotes: 40, data: '2026-07-01' },
  { sku: '500g', tipo: 'venda_apurada', qtdPacotes: 10, data: '2026-07-11' },
  { sku: '500g', tipo: 'venda_apurada', qtdPacotes: 10, data: '2026-07-21' },
]

describe('saldoPorSku', () => {
  it('soma entrega e subtrai venda apurada e retorno', () => {
    expect(saldoPorSku(MOVS)).toEqual({ '250g': 0, '500g': 20 })
  })

  it('retorno reduz o saldo', () => {
    const comRetorno: MovConsignado[] = [
      ...MOVS,
      { sku: '500g', tipo: 'retorno', qtdPacotes: 5, data: '2026-07-25' },
    ]
    expect(saldoPorSku(comRetorno)['500g']).toBe(15)
  })

  it('sem movimento o saldo e zero em todos os SKUs', () => {
    expect(saldoPorSku([])).toEqual({ '250g': 0, '500g': 0 })
  })
})

describe('saldoKg', () => {
  it('converte o saldo de pacotes para kg', () => {
    expect(saldoKg(MOVS)).toBe(10) // 20 pacotes de 500g
  })
})

describe('vendaApuradaDiariaKg', () => {
  it('divide o kg apurado pelos dias desde a primeira entrega', () => {
    // 20 pacotes de 500g = 10 kg apurados em 20 dias (01/07 -> 21/07)
    expect(vendaApuradaDiariaKg(MOVS, '2026-07-21')).toBe(0.5)
  })

  it('devolve null quando nunca houve apuracao', () => {
    const soEntrega: MovConsignado[] = [MOVS[0]]
    expect(vendaApuradaDiariaKg(soEntrega, '2026-07-21')).toBeNull()
  })

  it('retorno reduz o saldo mas nao conta como ritmo de venda', () => {
    const comRetorno: MovConsignado[] = [
      { sku: '500g', tipo: 'entrega', qtdPacotes: 40, data: '2026-07-01' },
      { sku: '500g', tipo: 'venda_apurada', qtdPacotes: 10, data: '2026-07-11' },
      { sku: '500g', tipo: 'retorno', qtdPacotes: 10, data: '2026-07-21' },
    ]
    // so os 10 pacotes apurados (5 kg) entram no ritmo, em 20 dias
    expect(vendaApuradaDiariaKg(comRetorno, '2026-07-21')).toBe(0.25)
    expect(saldoKg(comRetorno)).toBe(10)
  })
})

describe('diasRestantes', () => {
  it('estima quantos dias o saldo ainda cobre', () => {
    // saldo 10 kg / 0,5 kg por dia = 20 dias
    expect(diasRestantes(MOVS, '2026-07-21')).toBe(20)
  })

  it('devolve null sem apuracao — nao ha ritmo para dividir', () => {
    expect(diasRestantes([MOVS[0]], '2026-07-21')).toBeNull()
  })

  it('saldo negativo nao projeta dia negativo', () => {
    // apurou 30 pacotes mas so 20 foram entregues: inconsistencia de lancamento
    const inconsistente: MovConsignado[] = [
      { sku: '500g', tipo: 'entrega', qtdPacotes: 20, data: '2026-07-01' },
      { sku: '500g', tipo: 'venda_apurada', qtdPacotes: 30, data: '2026-07-21' },
    ]
    expect(diasRestantes(inconsistente, '2026-07-21')).toBe(0)
  })

  it('saldo zerado significa repor agora', () => {
    const zerado: MovConsignado[] = [
      { sku: '500g', tipo: 'entrega', qtdPacotes: 20, data: '2026-07-01' },
      { sku: '500g', tipo: 'venda_apurada', qtdPacotes: 20, data: '2026-07-21' },
    ]
    expect(diasRestantes(zerado, '2026-07-21')).toBe(0)
  })
})

describe('diasParado', () => {
  it('conta os dias desde a ultima apuracao', () => {
    expect(diasParado(MOVS, '2026-07-31')).toBe(10)
  })

  it('sem apuracao conta desde a primeira entrega', () => {
    expect(diasParado([MOVS[0]], '2026-07-31')).toBe(30)
  })

  it('devolve null sem nenhum movimento', () => {
    expect(diasParado([], '2026-07-31')).toBeNull()
  })
})

describe('previsaoReposicao', () => {
  it('projeta a data em que o saldo acaba', () => {
    expect(previsaoReposicao(MOVS, '2026-07-21')).toBe('2026-08-10')
  })

  it('devolve null quando nao da para estimar', () => {
    expect(previsaoReposicao([MOVS[0]], '2026-07-21')).toBeNull()
  })

  it('nunca devolve data no passado', () => {
    const inconsistente: MovConsignado[] = [
      { sku: '500g', tipo: 'entrega', qtdPacotes: 20, data: '2026-07-01' },
      { sku: '500g', tipo: 'venda_apurada', qtdPacotes: 30, data: '2026-07-21' },
    ]
    expect(previsaoReposicao(inconsistente, '2026-07-21')).toBe('2026-07-21')
  })
})

describe('situacaoPeloPrazo', () => {
  it('vencido ha 3 dias', () => {
    expect(situacaoPeloPrazo('2026-07-28', '2026-07-31')).toEqual({
      diasParaPrazo: -3,
      situacao: 'vencido',
    })
  })

  it('vence hoje conta como vence_em_breve', () => {
    expect(situacaoPeloPrazo('2026-07-31', '2026-07-31')).toEqual({
      diasParaPrazo: 0,
      situacao: 'vence_em_breve',
    })
  })

  it('vence no limite de 7 dias ainda e vence_em_breve', () => {
    expect(situacaoPeloPrazo('2026-08-07', '2026-07-31')).toEqual({
      diasParaPrazo: 7,
      situacao: 'vence_em_breve',
    })
  })

  it('vence em 8 dias vira em_dia', () => {
    expect(situacaoPeloPrazo('2026-08-08', '2026-07-31')).toEqual({
      diasParaPrazo: 8,
      situacao: 'em_dia',
    })
  })

  it('sem prazo devolve sem_prazo', () => {
    expect(situacaoPeloPrazo(null, '2026-07-31')).toEqual({
      diasParaPrazo: null,
      situacao: 'sem_prazo',
    })
  })
})

describe('pendenciaConsignado', () => {
  it('vencido ha 3 dias', () => {
    const pendencia = pendenciaConsignado(MOVS, '2026-07-28', '2026-07-31')
    expect(pendencia.situacao).toBe('vencido')
    expect(pendencia.diasParaPrazo).toBe(-3)
  })

  it('vence hoje (diasParaPrazo = 0) conta como vence_em_breve', () => {
    const pendencia = pendenciaConsignado(MOVS, '2026-07-31', '2026-07-31')
    expect(pendencia.situacao).toBe('vence_em_breve')
    expect(pendencia.diasParaPrazo).toBe(0)
  })

  it('vence no limite de 7 dias ainda e vence_em_breve', () => {
    const pendencia = pendenciaConsignado(MOVS, '2026-08-07', '2026-07-31')
    expect(pendencia.situacao).toBe('vence_em_breve')
    expect(pendencia.diasParaPrazo).toBe(7)
  })

  it('vence em 8 dias vira em_dia', () => {
    const pendencia = pendenciaConsignado(MOVS, '2026-08-08', '2026-07-31')
    expect(pendencia.situacao).toBe('em_dia')
    expect(pendencia.diasParaPrazo).toBe(8)
  })

  it('sem prazo devolve situacao sem_prazo e nao quebra', () => {
    const pendencia = pendenciaConsignado(MOVS, null, '2026-07-31')
    expect(pendencia.situacao).toBe('sem_prazo')
    expect(pendencia.diasParaPrazo).toBeNull()
  })

  it('reusa saldo e giro ja testados em vez de duplicar a conta', () => {
    const pendencia = pendenciaConsignado(MOVS, '2026-08-07', '2026-07-31')
    expect(pendencia.saldoKg).toBe(saldoKg(MOVS))
    expect(pendencia.saldoPorSku).toEqual(saldoPorSku(MOVS))
    expect(pendencia.diasParado).toBe(diasParado(MOVS, '2026-07-31'))
    expect(pendencia.previsaoAcabar).toBe(previsaoReposicao(MOVS, '2026-07-31'))
  })

  it('saldo zerado nao estoura', () => {
    const zerado: MovConsignado[] = [
      { sku: '500g', tipo: 'entrega', qtdPacotes: 20, data: '2026-07-01' },
      { sku: '500g', tipo: 'venda_apurada', qtdPacotes: 20, data: '2026-07-21' },
    ]
    const pendencia = pendenciaConsignado(zerado, '2026-08-01', '2026-07-31')
    expect(pendencia.saldoKg).toBe(0)
    expect(pendencia.saldoPorSku).toEqual({ '250g': 0, '500g': 0 })
    expect(pendencia.situacao).toBe('vence_em_breve')
  })

  it('sem nenhum movimento tambem nao estoura', () => {
    const pendencia = pendenciaConsignado([], '2026-08-07', '2026-07-31')
    expect(pendencia.saldoKg).toBe(0)
    expect(pendencia.diasParado).toBeNull()
    expect(pendencia.previsaoAcabar).toBeNull()
  })
})

describe('valorSaldoConsignado', () => {
  // tabela como a real: faixa comeca em 5 kg (o pedido e sempre multiplo de 5)
  const faixas: FaixaProduto[] = [
    { id: '1', produtoId: 'p250', kgMin: 5, kgMax: 10, precoUnit: 11, vigenteDesde: '2026-08-01' },
    { id: '2', produtoId: 'p250', kgMin: 15, kgMax: null, precoUnit: 10, vigenteDesde: '2026-08-01' },
    { id: '3', produtoId: 'p500', kgMin: 5, kgMax: 10, precoUnit: 22, vigenteDesde: '2026-08-01' },
    { id: '4', produtoId: 'p500', kgMin: 15, kgMax: null, precoUnit: 20, vigenteDesde: '2026-08-01' },
  ]

  it('valoriza o saldo pela faixa do menor volume, nao pelo peso do pacote', () => {
    // a regressao: perguntar a faixa por 0,25 kg nunca acha faixa (a tabela comeca em 5 kg)
    // e o valor em R$ nunca aparecia na tela
    expect(valorSaldoConsignado(faixas, { p250: 10, p500: 0 }, '2026-08-10')).toBe(110)
    expect(valorSaldoConsignado(faixas, { p250: 4, p500: 2 }, '2026-08-10')).toBe(88)
  })

  it('funciona para produto novo, sem sku legado — a pendencia que motivou tudo', () => {
    const comNovo = [
      ...faixas,
      { id: '5', produtoId: 'p1kg', kgMin: 5, kgMax: null, precoUnit: 40, vigenteDesde: '2026-08-01' },
    ]
    expect(valorSaldoConsignado(comNovo, { p1kg: 3 }, '2026-08-10')).toBe(120)
  })

  it('sem saldo nenhum devolve null', () => {
    expect(valorSaldoConsignado(faixas, { p250: 0, p500: 0 }, '2026-08-10')).toBeNull()
  })

  it('nao inventa valor quando falta faixa vigente para um produto com saldo', () => {
    const soUm = faixas.filter((f) => f.produtoId === 'p250')
    expect(valorSaldoConsignado(soUm, { p250: 4, p500: 2 }, '2026-08-10')).toBeNull()
    // tabela que ainda nao vigia na data tambem nao vale
    expect(valorSaldoConsignado(faixas, { p250: 4, p500: 0 }, '2026-07-31')).toBeNull()
  })

  it('ignora saldo negativo (lancamento inconsistente) sem estourar', () => {
    expect(valorSaldoConsignado(faixas, { p250: -3, p500: 2 }, '2026-08-10')).toBe(44)
  })
})

describe('saldo por produto (produto novo, sem sku legado)', () => {
  const P1KG = 'produto-1kg'
  const P250 = 'produto-250'
  const movs: MovConsignadoProduto[] = [
    { produtoId: P1KG, pesoKg: 1, tipo: 'entrega', qtdPacotes: 10, data: '2026-08-01' },
    { produtoId: P250, pesoKg: 0.25, tipo: 'entrega', qtdPacotes: 20, data: '2026-08-01' },
    { produtoId: P1KG, pesoKg: 1, tipo: 'venda_apurada', qtdPacotes: 4, data: '2026-08-05' },
    { produtoId: P250, pesoKg: 0.25, tipo: 'retorno', qtdPacotes: 20, data: '2026-08-05' },
  ]

  it('soma entrega e subtrai apuracao/retorno por produto', () => {
    expect(saldoPorProduto(movs)).toEqual({ [P1KG]: 6, [P250]: 0 })
  })

  it('saldo em kg usa o peso de cada produto', () => {
    // 6 pacotes de 1 kg + 0 de 250g
    expect(saldoKgProduto(movs)).toBe(6)
  })

  it('previsao de reposicao segue o ritmo apurado', () => {
    // 4 kg apurados em 4 dias = 1 kg/dia; saldo 6 kg -> acaba em 6 dias
    expect(previsaoReposicaoProduto(movs, '2026-08-05')).toBe('2026-08-11')
  })

  it('sem apuracao nenhuma nao projeta data', () => {
    const soEntrega = movs.filter((m) => m.tipo === 'entrega')
    expect(previsaoReposicaoProduto(soEntrega, '2026-08-05')).toBeNull()
  })
})
