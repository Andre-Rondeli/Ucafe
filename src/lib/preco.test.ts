import { describe, expect, it } from 'vitest'
import type { FaixaPreco, Produto } from './tipos'
import {
  ehMultiploValido,
  faixaVigente,
  faixaVigenteProduto,
  kgMaisProximos,
  kgTotal,
  kgTotalProdutos,
  pacotesPorCaixa,
  precificar,
  precificarProdutos,
  precoClienteVigente,
  proximaFaixa,
  proximaFaixaProduto,
  totalPedido,
  totalPedidoProdutos,
  validarItensCaixa,
  validarFaixas,
  validarFaixasProduto,
  type FaixaParaValidar,
  type FaixaProdutoParaValidar,
} from './preco'

/** Tabela de exemplo: faixas em kg do pedido inteiro, por SKU. */
const FAIXAS: FaixaPreco[] = [
  { id: 'a1', sku: '250g', kgMin: 0, kgMax: 10, precoUnit: 12, vigenteDesde: '2026-01-01' },
  { id: 'a2', sku: '250g', kgMin: 10.001, kgMax: 50, precoUnit: 11, vigenteDesde: '2026-01-01' },
  { id: 'a3', sku: '250g', kgMin: 50.001, kgMax: null, precoUnit: 10, vigenteDesde: '2026-01-01' },
  { id: 'b1', sku: '500g', kgMin: 0, kgMax: 10, precoUnit: 22, vigenteDesde: '2026-01-01' },
  { id: 'b2', sku: '500g', kgMin: 10.001, kgMax: 50, precoUnit: 20, vigenteDesde: '2026-01-01' },
  { id: 'b3', sku: '500g', kgMin: 50.001, kgMax: null, precoUnit: 18, vigenteDesde: '2026-01-01' },
  // reajuste posterior do 500g — versão completa, as três faixas com a mesma vigência
  { id: 'b1v2', sku: '500g', kgMin: 0, kgMax: 10, precoUnit: 22, vigenteDesde: '2026-06-01' },
  { id: 'b2v2', sku: '500g', kgMin: 10.001, kgMax: 50, precoUnit: 21, vigenteDesde: '2026-06-01' },
  { id: 'b3v2', sku: '500g', kgMin: 50.001, kgMax: null, precoUnit: 18, vigenteDesde: '2026-06-01' },
]

describe('kgTotal', () => {
  it('soma 250g e 500g em kg', () => {
    expect(kgTotal([{ sku: '250g', qtdPacotes: 4 }])).toBe(1)
    expect(kgTotal([{ sku: '500g', qtdPacotes: 3 }])).toBe(1.5)
    expect(
      kgTotal([
        { sku: '250g', qtdPacotes: 40 },
        { sku: '500g', qtdPacotes: 20 },
      ]),
    ).toBe(20)
  })

  it('pedido vazio tem 0 kg', () => {
    expect(kgTotal([])).toBe(0)
  })
})

describe('faixaVigente', () => {
  it('escolhe a faixa pelo kg TOTAL do pedido, nao pelo kg do SKU', () => {
    // 8 pacotes de 250g = 2 kg, mas com 500g o pedido vai a 12 kg -> faixa do meio
    const itens = [
      { sku: '250g' as const, qtdPacotes: 8 },
      { sku: '500g' as const, qtdPacotes: 20 },
    ]
    const total = kgTotal(itens) // 2 + 10 = 12
    expect(total).toBe(12)
    expect(faixaVigente(FAIXAS, '250g', total, '2026-03-01')?.precoUnit).toBe(11)
  })

  it('respeita o teto e o piso da faixa', () => {
    expect(faixaVigente(FAIXAS, '250g', 10, '2026-03-01')?.precoUnit).toBe(12)
    expect(faixaVigente(FAIXAS, '250g', 50, '2026-03-01')?.precoUnit).toBe(11)
    expect(faixaVigente(FAIXAS, '250g', 300, '2026-03-01')?.precoUnit).toBe(10)
  })

  it('usa a versao vigente na data do pedido, nao a mais recente', () => {
    expect(faixaVigente(FAIXAS, '500g', 20, '2026-03-01')?.precoUnit).toBe(20)
    expect(faixaVigente(FAIXAS, '500g', 20, '2026-07-01')?.precoUnit).toBe(21)
  })

  it('devolve null quando nao ha faixa aplicavel', () => {
    expect(faixaVigente(FAIXAS, '500g', 20, '2025-12-31')).toBeNull()
  })

  it('versao mais recente incompleta (faixa do meio faltando) devolve null, nao vaza preco da versao anterior', () => {
    const faixasComVersaoIncompleta: FaixaPreco[] = [
      ...FAIXAS,
      // reajuste do 250g esquecendo a faixa do meio (10.001-50)
      { id: 'a1v2', sku: '250g', kgMin: 0, kgMax: 10, precoUnit: 13, vigenteDesde: '2026-08-01' },
      { id: 'a3v2', sku: '250g', kgMin: 50.001, kgMax: null, precoUnit: 11, vigenteDesde: '2026-08-01' },
    ]
    expect(faixaVigente(faixasComVersaoIncompleta, '250g', 20, '2026-09-01')).toBeNull()
  })
})

describe('precificar', () => {
  it('aplica a faixa do kg total a todos os itens e calcula subtotal', () => {
    const itens = [
      { sku: '250g' as const, qtdPacotes: 8 },
      { sku: '500g' as const, qtdPacotes: 20 },
    ]
    const precificados = precificar(itens, FAIXAS, '2026-03-01')
    expect(precificados).toEqual([
      { sku: '250g', qtdPacotes: 8, precoUnit: 11, subtotal: 88 },
      { sku: '500g', qtdPacotes: 20, precoUnit: 20, subtotal: 400 },
    ])
  })

  it('ignora item com quantidade zero', () => {
    const precificados = precificar(
      [
        { sku: '250g', qtdPacotes: 0 },
        { sku: '500g', qtdPacotes: 4 },
      ],
      FAIXAS,
      '2026-03-01',
    )
    expect(precificados).toHaveLength(1)
    expect(precificados[0].sku).toBe('500g')
  })

  it('lanca erro quando falta faixa para o SKU na data', () => {
    expect(() => precificar([{ sku: '500g', qtdPacotes: 4 }], FAIXAS, '2025-01-01')).toThrow(
      /sem faixa de preço/i,
    )
  })
})

describe('totalPedido', () => {
  it('soma kg e valor dos itens precificados', () => {
    const total = totalPedido([
      { sku: '250g', qtdPacotes: 8, precoUnit: 11, subtotal: 88 },
      { sku: '500g', qtdPacotes: 20, precoUnit: 20, subtotal: 400 },
    ])
    expect(total).toEqual({ totalKg: 12, totalValor: 488 })
  })
})

describe('ehMultiploValido', () => {
  it('aceita multiplos positivos de 5', () => {
    expect(ehMultiploValido(5)).toBe(true)
    expect(ehMultiploValido(10)).toBe(true)
    expect(ehMultiploValido(50)).toBe(true)
    expect(ehMultiploValido(500)).toBe(true)
  })

  it('rejeita 0 (pedido vazio nao e pedido)', () => {
    expect(ehMultiploValido(0)).toBe(false)
  })

  it('rejeita valores que nao sao multiplo de 5', () => {
    expect(ehMultiploValido(12)).toBe(false)
    expect(ehMultiploValido(2.5)).toBe(false)
    expect(ehMultiploValido(0.25)).toBe(false)
  })

  it('tolera erro de ponto flutuante de ate 0.001', () => {
    expect(ehMultiploValido(9.9995)).toBe(true)
    expect(ehMultiploValido(10.0009)).toBe(true)
    expect(ehMultiploValido(10.01)).toBe(false)
  })
})

describe('kgMaisProximos', () => {
  it('devolve o multiplo abaixo e acima para valor invalido', () => {
    expect(kgMaisProximos(12)).toEqual({ abaixo: 10, acima: 15 })
  })

  it('nao existe multiplo positivo abaixo de 5', () => {
    expect(kgMaisProximos(2)).toEqual({ abaixo: null, acima: 5 })
  })

  it('valor ja valido devolve o proprio valor nos dois lados', () => {
    expect(kgMaisProximos(10)).toEqual({ abaixo: 10, acima: 10 })
  })
})

describe('proximaFaixa', () => {
  it('devolve a faixa seguinte para virar argumento de venda', () => {
    const proxima = proximaFaixa(FAIXAS, '250g', 45, '2026-03-01')
    expect(proxima?.kgMin).toBe(50.001)
    expect(proxima?.precoUnit).toBe(10)
  })

  it('devolve null quando o cliente ja esta na melhor faixa', () => {
    expect(proximaFaixa(FAIXAS, '250g', 80, '2026-03-01')).toBeNull()
  })
})

describe('validarFaixas', () => {
  const faixa = (kgMin: number, kgMax: number | null, precoUnit: number): FaixaParaValidar => ({
    sku: '250g',
    kgMin,
    kgMax,
    precoUnit,
  })

  it('caminho feliz: grade de 5 fechada e sem furo (5-25, 30-50, 55-sem teto)', () => {
    expect(
      validarFaixas([faixa(5, 25, 11), faixa(30, 50, 10), faixa(55, null, 8.7)]),
    ).toBeNull()
  })

  it('5-25 seguido de 30-50 nao e furo (caso que hoje falha em ponto flutuante)', () => {
    // sem a faixa sem-teto, a tabela fica incompleta - mas a mensagem tem que ser
    // "falta faixa sem teto", nunca um falso furo entre 25 e 30.
    const resultado = validarFaixas([faixa(5, 25, 11), faixa(30, 50, 10)])
    expect(resultado).toBe(
      'Falta a faixa sem teto do 250g. Deixe o campo de kg máximo vazio na última faixa, senão pedido grande fica sem preço.',
    )
  })

  it('rejeita preço vazio ou invalido', () => {
    const resultado = validarFaixas([
      faixa(5, 25, 11),
      faixa(30, 50, NaN),
      faixa(55, null, 8.7),
    ])
    expect(resultado).toBe(
      'O preço da faixa de 30 kg do 250g está vazio ou inválido. Use vírgula ou ponto, por exemplo 10,50.',
    )
  })

  it('rejeita kg que nao e multiplo de 5', () => {
    const resultado = validarFaixas([
      faixa(5, 25, 11),
      faixa(27, 50, 10),
      faixa(55, null, 8.7),
    ])
    expect(resultado).toBe(
      'A faixa do 250g que começa em 27 kg não é múltipla de 5. Use números fechados: 5, 10, 15, 20…',
    )
  })

  it('rejeita primeira faixa que nao comeca em 5', () => {
    const resultado = validarFaixas([faixa(30, null, 10)])
    expect(resultado).toBe(
      'A primeira faixa do 250g começa em 30 kg. Ela precisa começar em 5 kg, que é o pedido mínimo.',
    )
  })

  it('rejeita teto menor ou igual ao piso', () => {
    const resultado = validarFaixas([faixa(5, 25, 11), faixa(30, 25, 10)])
    expect(resultado).toBe(
      'A faixa do 250g que começa em 30 kg termina em 25 kg. O teto tem que ser maior que o piso.',
    )
  })

  it('rejeita faixas sobrepostas', () => {
    const resultado = validarFaixas([faixa(5, 50, 11), faixa(50, null, 8.7)])
    expect(resultado).toBe(
      'As faixas do 250g se sobrepõem: uma vai até 50 kg e a seguinte já começa em 50 kg.',
    )
  })

  it('rejeita sobreposição no meio da tabela em geral (caso 5-15 e 10-25, sem envolver zero)', () => {
    const resultado = validarFaixas([faixa(5, 15, 11), faixa(10, 25, 10), faixa(30, null, 8.7)])
    expect(resultado).toBe(
      'As faixas do 250g se sobrepõem: uma vai até 15 kg e a seguinte já começa em 10 kg.',
    )
  })

  it('grade antiga (0-10) misturada com a nova (5-10) do mesmo SKU: 0 passa no multiplo de 5, mas a regra de "primeira faixa começa em 5" barra a mistura das duas versões', () => {
    // este é o cenário real do incidente: salvar duas vezes na mesma data deixou
    // 0-10 (versão antiga) e 5-10 (versão nova) juntas na mesma vigência.
    const resultado = validarFaixas([faixa(0, 10, 12), faixa(5, 10, 12), faixa(55, null, 10)])
    expect(resultado).toBe(
      'A primeira faixa do 250g começa em 0 kg. Ela precisa começar em 5 kg, que é o pedido mínimo.',
    )
  })

  it('rejeita furo real entre faixas', () => {
    const resultado = validarFaixas([faixa(5, 25, 11), faixa(40, null, 8.7)])
    expect(resultado).toBe(
      'A tabela do 250g pula de 25 kg para 40 kg. A faixa seguinte tem que começar em 30 kg.',
    )
  })

  it('rejeita tabela sem faixa sem teto', () => {
    const resultado = validarFaixas([faixa(5, 50, 11)])
    expect(resultado).toBe(
      'Falta a faixa sem teto do 250g. Deixe o campo de kg máximo vazio na última faixa, senão pedido grande fica sem preço.',
    )
  })

  it('rejeita duas faixas sem teto', () => {
    const resultado = validarFaixas([faixa(5, null, 11), faixa(30, null, 8.7)])
    expect(resultado).toBe('O 250g tem duas faixas sem teto. Só a última pode ficar sem teto.')
  })

  it('valida so os SKUs presentes na lista (um SKU so e permitido)', () => {
    expect(
      validarFaixas([
        { sku: '500g', kgMin: 5, kgMax: 25, precoUnit: 20 },
        { sku: '500g', kgMin: 30, kgMax: null, precoUnit: 18 },
      ]),
    ).toBeNull()
  })
})

// ==================================================================================
// Versões por produto — mesmo comportamento de cima, agora sobre produto_id.
// ==================================================================================

const PRODUTOS: Produto[] = [
  { id: 'p250', nome: 'Café 250g', descricao: null, pesoKg: 0.25, fotoUrl: null, skuLegado: '250g', ativo: true, ordem: 1 },
  { id: 'p500', nome: 'Café 500g', descricao: null, pesoKg: 0.5, fotoUrl: null, skuLegado: '500g', ativo: true, ordem: 2 },
  { id: 'p1kg', nome: 'Café 1kg', descricao: null, pesoKg: 1, fotoUrl: null, skuLegado: null, ativo: true, ordem: 3 },
]

const FAIXAS_PRODUTO = [
  { id: 'a1', produtoId: 'p250', kgMin: 0, kgMax: 10, precoUnit: 12, vigenteDesde: '2026-01-01' },
  { id: 'a2', produtoId: 'p250', kgMin: 10.001, kgMax: 50, precoUnit: 11, vigenteDesde: '2026-01-01' },
  { id: 'a3', produtoId: 'p250', kgMin: 50.001, kgMax: null, precoUnit: 10, vigenteDesde: '2026-01-01' },
  { id: 'b1', produtoId: 'p500', kgMin: 0, kgMax: 10, precoUnit: 22, vigenteDesde: '2026-01-01' },
  { id: 'b2', produtoId: 'p500', kgMin: 10.001, kgMax: 50, precoUnit: 20, vigenteDesde: '2026-01-01' },
  { id: 'b3', produtoId: 'p500', kgMin: 50.001, kgMax: null, precoUnit: 18, vigenteDesde: '2026-01-01' },
  // reajuste posterior do p500 — versão completa, as três faixas com a mesma vigência
  { id: 'b1v2', produtoId: 'p500', kgMin: 0, kgMax: 10, precoUnit: 22, vigenteDesde: '2026-06-01' },
  { id: 'b2v2', produtoId: 'p500', kgMin: 10.001, kgMax: 50, precoUnit: 21, vigenteDesde: '2026-06-01' },
  { id: 'b3v2', produtoId: 'p500', kgMin: 50.001, kgMax: null, precoUnit: 18, vigenteDesde: '2026-06-01' },
]

describe('kgTotalProdutos', () => {
  it('soma o kg de produtos com pesos diferentes', () => {
    expect(kgTotalProdutos([{ produtoId: 'p250', qtdPacotes: 4 }], PRODUTOS)).toBe(1)
    expect(kgTotalProdutos([{ produtoId: 'p500', qtdPacotes: 3 }], PRODUTOS)).toBe(1.5)
  })

  it('pedido vazio tem 0 kg', () => {
    expect(kgTotalProdutos([], PRODUTOS)).toBe(0)
  })

  it('peso de produto novo (1 kg) entra no calculo de kg total', () => {
    expect(
      kgTotalProdutos(
        [
          { produtoId: 'p250', qtdPacotes: 4 }, // 1 kg
          { produtoId: 'p1kg', qtdPacotes: 3 }, // 3 kg
        ],
        PRODUTOS,
      ),
    ).toBe(4)
  })
})

describe('faixaVigenteProduto', () => {
  it('escolhe a faixa pelo kg TOTAL do pedido com dois produtos de pesos diferentes', () => {
    // 8 pacotes de p250 = 2 kg, mas com p500 o pedido vai a 12 kg -> faixa do meio
    const itens = [
      { produtoId: 'p250', qtdPacotes: 8 },
      { produtoId: 'p500', qtdPacotes: 20 },
    ]
    const total = kgTotalProdutos(itens, PRODUTOS) // 2 + 10 = 12
    expect(total).toBe(12)
    expect(faixaVigenteProduto(FAIXAS_PRODUTO, 'p250', total, '2026-03-01')?.precoUnit).toBe(11)
  })

  it('respeita o teto e o piso da faixa', () => {
    expect(faixaVigenteProduto(FAIXAS_PRODUTO, 'p250', 10, '2026-03-01')?.precoUnit).toBe(12)
    expect(faixaVigenteProduto(FAIXAS_PRODUTO, 'p250', 50, '2026-03-01')?.precoUnit).toBe(11)
    expect(faixaVigenteProduto(FAIXAS_PRODUTO, 'p250', 300, '2026-03-01')?.precoUnit).toBe(10)
  })

  it('usa a versao vigente na data do pedido, por produto — nao a mais recente', () => {
    expect(faixaVigenteProduto(FAIXAS_PRODUTO, 'p500', 20, '2026-03-01')?.precoUnit).toBe(20)
    expect(faixaVigenteProduto(FAIXAS_PRODUTO, 'p500', 20, '2026-07-01')?.precoUnit).toBe(21)
  })

  it('devolve null quando nao ha faixa aplicavel', () => {
    expect(faixaVigenteProduto(FAIXAS_PRODUTO, 'p500', 20, '2025-12-31')).toBeNull()
  })

  it('versao mais recente incompleta (faixa do meio faltando) devolve null, nao vaza preco da versao anterior', () => {
    const faixasComVersaoIncompleta = [
      ...FAIXAS_PRODUTO,
      // reajuste do p250 esquecendo a faixa do meio (10.001-50)
      { id: 'a1v2', produtoId: 'p250', kgMin: 0, kgMax: 10, precoUnit: 13, vigenteDesde: '2026-08-01' },
      { id: 'a3v2', produtoId: 'p250', kgMin: 50.001, kgMax: null, precoUnit: 11, vigenteDesde: '2026-08-01' },
    ]
    expect(faixaVigenteProduto(faixasComVersaoIncompleta, 'p250', 20, '2026-09-01')).toBeNull()
  })
})

describe('precificarProdutos', () => {
  it('aplica a faixa do kg total a todos os itens e calcula subtotal', () => {
    const itens = [
      { produtoId: 'p250', qtdPacotes: 8 },
      { produtoId: 'p500', qtdPacotes: 20 },
    ]
    const precificados = precificarProdutos(itens, PRODUTOS, FAIXAS_PRODUTO, '2026-03-01')
    expect(precificados).toEqual([
      { produtoId: 'p250', qtdPacotes: 8, precoUnit: 11, subtotal: 88, origem: 'faixa' },
      { produtoId: 'p500', qtdPacotes: 20, precoUnit: 20, subtotal: 400, origem: 'faixa' },
    ])
  })

  it('ignora item com quantidade zero', () => {
    const precificados = precificarProdutos(
      [
        { produtoId: 'p250', qtdPacotes: 0 },
        { produtoId: 'p500', qtdPacotes: 4 },
      ],
      PRODUTOS,
      FAIXAS_PRODUTO,
      '2026-03-01',
    )
    expect(precificados).toHaveLength(1)
    expect(precificados[0].produtoId).toBe('p500')
  })

  it('lanca erro citando o NOME do produto quando falta faixa na data', () => {
    expect(() =>
      precificarProdutos([{ produtoId: 'p500', qtdPacotes: 4 }], PRODUTOS, FAIXAS_PRODUTO, '2025-01-01'),
    ).toThrow(/sem faixa de preço para café 500g/i)
  })
})

describe('totalPedidoProdutos', () => {
  it('soma kg e valor dos itens precificados', () => {
    const total = totalPedidoProdutos(
      [
        { produtoId: 'p250', qtdPacotes: 8, precoUnit: 11, subtotal: 88 },
        { produtoId: 'p500', qtdPacotes: 20, precoUnit: 20, subtotal: 400 },
      ],
      PRODUTOS,
    )
    expect(total).toEqual({ totalKg: 12, totalValor: 488 })
  })
})

describe('proximaFaixaProduto', () => {
  it('devolve a faixa seguinte para virar argumento de venda', () => {
    const proxima = proximaFaixaProduto(FAIXAS_PRODUTO, 'p250', 45, '2026-03-01')
    expect(proxima?.kgMin).toBe(50.001)
    expect(proxima?.precoUnit).toBe(10)
  })

  it('devolve null quando o cliente ja esta na melhor faixa', () => {
    expect(proximaFaixaProduto(FAIXAS_PRODUTO, 'p250', 80, '2026-03-01')).toBeNull()
  })
})

describe('validarFaixasProduto', () => {
  const faixa = (kgMin: number, kgMax: number | null, precoUnit: number): FaixaProdutoParaValidar => ({
    produtoId: 'p250',
    kgMin,
    kgMax,
    precoUnit,
  })

  it('caminho feliz: grade de 5 fechada e sem furo (5-25, 30-50, 55-sem teto)', () => {
    expect(
      validarFaixasProduto([faixa(5, 25, 11), faixa(30, 50, 10), faixa(55, null, 8.7)], PRODUTOS),
    ).toBeNull()
  })

  it('rejeita preço vazio ou invalido, citando o nome do produto', () => {
    const resultado = validarFaixasProduto(
      [faixa(5, 25, 11), faixa(30, 50, NaN), faixa(55, null, 8.7)],
      PRODUTOS,
    )
    expect(resultado).toBe(
      'O preço da faixa de 30 kg do Café 250g está vazio ou inválido. Use vírgula ou ponto, por exemplo 10,50.',
    )
  })

  it('rejeita kg que nao e multiplo de 5', () => {
    const resultado = validarFaixasProduto(
      [faixa(5, 25, 11), faixa(27, 50, 10), faixa(55, null, 8.7)],
      PRODUTOS,
    )
    expect(resultado).toBe(
      'A faixa do Café 250g que começa em 27 kg não é múltipla de 5. Use números fechados: 5, 10, 15, 20…',
    )
  })

  it('rejeita primeira faixa que nao comeca em 5', () => {
    const resultado = validarFaixasProduto([faixa(30, null, 10)], PRODUTOS)
    expect(resultado).toBe(
      'A primeira faixa do Café 250g começa em 30 kg. Ela precisa começar em 5 kg, que é o pedido mínimo.',
    )
  })

  it('rejeita teto menor ou igual ao piso', () => {
    const resultado = validarFaixasProduto([faixa(5, 25, 11), faixa(30, 25, 10)], PRODUTOS)
    expect(resultado).toBe(
      'A faixa do Café 250g que começa em 30 kg termina em 25 kg. O teto tem que ser maior que o piso.',
    )
  })

  it('rejeita faixas sobrepostas', () => {
    const resultado = validarFaixasProduto([faixa(5, 50, 11), faixa(50, null, 8.7)], PRODUTOS)
    expect(resultado).toBe(
      'As faixas do Café 250g se sobrepõem: uma vai até 50 kg e a seguinte já começa em 50 kg.',
    )
  })

  it('rejeita furo real entre faixas', () => {
    const resultado = validarFaixasProduto([faixa(5, 25, 11), faixa(40, null, 8.7)], PRODUTOS)
    expect(resultado).toBe(
      'A tabela do Café 250g pula de 25 kg para 40 kg. A faixa seguinte tem que começar em 30 kg.',
    )
  })

  it('rejeita tabela sem faixa sem teto', () => {
    const resultado = validarFaixasProduto([faixa(5, 50, 11)], PRODUTOS)
    expect(resultado).toBe(
      'Falta a faixa sem teto do Café 250g. Deixe o campo de kg máximo vazio na última faixa, senão pedido grande fica sem preço.',
    )
  })

  it('rejeita duas faixas sem teto', () => {
    const resultado = validarFaixasProduto([faixa(5, null, 11), faixa(30, null, 8.7)], PRODUTOS)
    expect(resultado).toBe('O Café 250g tem duas faixas sem teto. Só a última pode ficar sem teto.')
  })

  it('valida so os produtos presentes na lista (um produto so e permitido)', () => {
    expect(
      validarFaixasProduto(
        [
          { produtoId: 'p500', kgMin: 5, kgMax: 25, precoUnit: 20 },
          { produtoId: 'p500', kgMin: 30, kgMax: null, precoUnit: 18 },
        ],
        PRODUTOS,
      ),
    ).toBeNull()
  })

  it('cai no proprio produtoId como rotulo se o produto nao estiver na lista (defensivo)', () => {
    const resultado = validarFaixasProduto([{ produtoId: 'inexistente', kgMin: 30, kgMax: null, precoUnit: 10 }], [])
    expect(resultado).toBe(
      'A primeira faixa do inexistente começa em 30 kg. Ela precisa começar em 5 kg, que é o pedido mínimo.',
    )
  })
})

describe('pacotesPorCaixa', () => {
  it('converte o peso do pacote em pacotes por caixa de 5 kg', () => {
    expect(pacotesPorCaixa(0.25)).toBe(20)
    expect(pacotesPorCaixa(0.5)).toBe(10)
    expect(pacotesPorCaixa(1)).toBe(5)
    expect(pacotesPorCaixa(5)).toBe(1)
  })

  it('peso que nao divide a caixa devolve null', () => {
    expect(pacotesPorCaixa(0.3)).toBeNull()
    expect(pacotesPorCaixa(0)).toBeNull()
  })
})

describe('validarItensCaixa', () => {
  const produtos: Produto[] = [
    { id: 'p250', nome: 'Café Torrão 250g', descricao: null, pesoKg: 0.25, fotoUrl: null, skuLegado: '250g', ativo: true, ordem: 1 },
    { id: 'p500', nome: 'Café Torrão 500g', descricao: null, pesoKg: 0.5, fotoUrl: null, skuLegado: '500g', ativo: true, ordem: 2 },
  ]

  it('caixa fechada por produto passa', () => {
    expect(validarItensCaixa([{ produtoId: 'p250', qtdPacotes: 20 }], produtos)).toBeNull()
    expect(validarItensCaixa([{ produtoId: 'p250', qtdPacotes: 40 }, { produtoId: 'p500', qtdPacotes: 10 }], produtos)).toBeNull()
  })

  it('5 pacotes de 250g (1,25 kg) nao existe — o caso da tela', () => {
    const erro = validarItensCaixa([{ produtoId: 'p250', qtdPacotes: 5 }], produtos)
    expect(erro).toContain('1.25 kg')
    expect(erro).toContain('de 20 em 20')
  })

  it('total fechado com itens quebrados TAMBEM e recusado', () => {
    // 10x250g (2,5) + 5x500g (2,5) = 5 kg no total, mas nenhuma caixa fecha
    const erro = validarItensCaixa(
      [{ produtoId: 'p250', qtdPacotes: 10 }, { produtoId: 'p500', qtdPacotes: 5 }],
      produtos,
    )
    expect(erro).toContain('de 20 em 20')
  })

  it('quantidade zero nao acusa nada', () => {
    expect(validarItensCaixa([{ produtoId: 'p250', qtdPacotes: 0 }], produtos)).toBeNull()
  })
})


describe('preço combinado com o cliente', () => {
  const PRODUTO = 'p-250'
  const produtosTeste = [
    { id: PRODUTO, nome: 'Café Torrão 250g', descricao: null, pesoKg: 0.25, fotoUrl: null, skuLegado: null, ativo: true, ordem: 0 },
  ]
  const faixasTeste = [
    { id: 'f1', produtoId: PRODUTO, kgMin: 5, kgMax: 50, precoUnit: 10, vigenteDesde: '2026-01-01' },
    { id: 'f2', produtoId: PRODUTO, kgMin: 50.001, kgMax: null, precoUnit: 8, vigenteDesde: '2026-01-01' },
  ]
  const itens = [{ produtoId: PRODUTO, qtdPacotes: 40 }] // 10 kg

  it('o preço do cliente VENCE a faixa de kg', () => {
    const [item] = precificarProdutos(itens, produtosTeste, faixasTeste, '2026-08-24', [
      { produtoId: PRODUTO, precoUnit: 6.5, vigenteDesde: '2026-08-01' },
    ])
    expect(item.precoUnit).toBe(6.5)
    expect(item.origem).toBe('cliente')
    expect(item.subtotal).toBe(260)
  })

  it('o volume deixa de mudar o preço — é o que "preço fixo" quer dizer', () => {
    const preco = [{ produtoId: PRODUTO, precoUnit: 6.5, vigenteDesde: '2026-08-01' }]
    const pequeno = precificarProdutos([{ produtoId: PRODUTO, qtdPacotes: 40 }], produtosTeste, faixasTeste, '2026-08-24', preco)
    const grande = precificarProdutos([{ produtoId: PRODUTO, qtdPacotes: 400 }], produtosTeste, faixasTeste, '2026-08-24', preco)
    expect(pequeno[0].precoUnit).toBe(grande[0].precoUnit)
  })

  it('sem preço combinado, continua valendo a faixa', () => {
    const [item] = precificarProdutos(itens, produtosTeste, faixasTeste, '2026-08-24', [])
    expect(item.precoUnit).toBe(10)
    expect(item.origem).toBe('faixa')
  })

  it('cliente com preço fixo NÃO precisa de faixa para aquele volume', () => {
    // 1 pacote = 0,25 kg, fora de qualquer faixa: com preço de cliente, não estoura
    expect(() =>
      precificarProdutos([{ produtoId: PRODUTO, qtdPacotes: 1 }], produtosTeste, [], '2026-08-24', [
        { produtoId: PRODUTO, precoUnit: 6.5, vigenteDesde: '2026-08-01' },
      ]),
    ).not.toThrow()
  })

  it('preço com data futura ainda não vale', () => {
    expect(
      precoClienteVigente([{ produtoId: PRODUTO, precoUnit: 5, vigenteDesde: '2026-09-01' }], PRODUTO, '2026-08-24'),
    ).toBeNull()
  })

  it('reajuste é registro novo: vale o mais recente que já entrou em vigor', () => {
    const precos = [
      { produtoId: PRODUTO, precoUnit: 6, vigenteDesde: '2026-01-01' },
      { produtoId: PRODUTO, precoUnit: 7, vigenteDesde: '2026-08-01' },
      { produtoId: PRODUTO, precoUnit: 9, vigenteDesde: '2026-12-01' },
    ]
    expect(precoClienteVigente(precos, PRODUTO, '2026-08-24')).toBe(7)
    expect(precoClienteVigente(precos, PRODUTO, '2026-07-31')).toBe(6)
  })

  it('preço de outro produto não vaza para este', () => {
    expect(
      precoClienteVigente([{ produtoId: 'p-500', precoUnit: 13, vigenteDesde: '2026-01-01' }], PRODUTO, '2026-08-24'),
    ).toBeNull()
  })
})
