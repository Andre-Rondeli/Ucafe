import { describe, expect, it } from 'vitest'
import {
  ancoraDaJanela,
  calcularDesde,
  COBERTURA_CURTA,
  decidirSeGrava,
  DIAS_DE_SOBREPOSICAO,
  ehPontoDeVenda,
  fundirFeed,
  JANELA_DIAS,
  PRIMEIRO_DIA,
  LIMITE_COBERTURA_DIAS,
  resumirPorLoja,
  resumirRede,
  serieDaLoja,
  type EstoqueDoFeed,
  type LinhaEspelho,
  type VendaDoFeed,
} from './rede'

const venda = (over: Partial<VendaDoFeed> = {}): VendaDoFeed => ({
  dia: '2026-08-29',
  loja_codigo: '101',
  loja_nome: 'Eunápolis Centro',
  loja_tipo: 'supermercado',
  uf: 'BA',
  produto_codigo: '29943',
  produto_nome: 'CAFE PCT TORRAO 250G TRADICIONAL',
  qtd: '12.0000',
  valor: '141.48',
  ...over,
})

const estoque = (over: Partial<EstoqueDoFeed> = {}): EstoqueDoFeed => ({
  dia: '2026-08-29',
  loja_codigo: '101',
  loja_nome: 'Eunápolis Centro',
  loja_tipo: 'supermercado',
  uf: 'BA',
  produto_codigo: '29943',
  produto_nome: 'CAFE PCT TORRAO 250G TRADICIONAL',
  estoque_qtd: '314.000000',
  ...over,
})

describe('fundirFeed', () => {
  it('junta venda e estoque do mesmo dia/loja/produto numa linha só', () => {
    const linhas = fundirFeed([venda()], [estoque()])
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      dia: '2026-08-29',
      loja_codigo: '101',
      produto_codigo: '29943',
      venda_qtd: 12,
      venda_valor: 141.48,
      estoque_qtd: 314,
    })
  })

  it('converte o numeric do Postgres, que chega como string, em número', () => {
    const [linha] = fundirFeed([venda({ qtd: '96.0000', valor: '1105.75' })], [])
    expect(linha.venda_qtd).toBe(96)
    expect(linha.venda_valor).toBe(1105.75)
  })

  // A regra que mais importa: dia sem venda tem de sair NULO, não zero. Zero é uma
  // afirmação ("essa loja não vendeu nada"), e o feed simplesmente não trouxe o dia.
  it('deixa venda nula — nunca zero — no dia em que só houve foto de estoque', () => {
    const [linha] = fundirFeed([], [estoque({ dia: '2026-07-14' })])
    expect(linha.venda_qtd).toBeNull()
    expect(linha.venda_valor).toBeNull()
    expect(linha.estoque_qtd).toBe(314)
  })

  it('deixa estoque nulo no dia em que só houve venda', () => {
    const [linha] = fundirFeed([venda({ dia: '2026-06-02' })], [])
    expect(linha.estoque_qtd).toBeNull()
    expect(linha.venda_qtd).toBe(12)
  })

  // Sem a fusão, gravar venda e estoque em dois upserts faria o segundo escrever null por
  // cima do primeiro. O apagamento seria mudo: a linha continua lá, o número some.
  it('não perde o estoque quando a venda do mesmo dia é processada depois', () => {
    const linhas = fundirFeed(
      [venda({ dia: '2026-08-30' })],
      [estoque({ dia: '2026-08-30', estoque_qtd: '426' })],
    )
    expect(linhas).toHaveLength(1)
    expect(linhas[0].estoque_qtd).toBe(426)
    expect(linhas[0].venda_qtd).toBe(12)
  })

  it('separa linhas de lojas e produtos diferentes', () => {
    const linhas = fundirFeed(
      [venda(), venda({ loja_codigo: '122' }), venda({ produto_codigo: '29944' })],
      [],
    )
    expect(linhas).toHaveLength(3)
  })

  it('completa o rótulo que faltou numa das fontes em vez de apagá-lo', () => {
    const [linha] = fundirFeed(
      [venda({ loja_nome: null, uf: null })],
      [estoque({ loja_nome: 'Eunápolis Centro', uf: 'BA' })],
    )
    expect(linha.loja_nome).toBe('Eunápolis Centro')
    expect(linha.uf).toBe('BA')
  })
})

describe('calcularDesde', () => {
  it('recua a janela de sobreposição para pegar a autocorreção do Consinco', () => {
    expect(calcularDesde('2026-08-29')).toBe('2026-08-26')
    expect(DIAS_DE_SOBREPOSICAO).toBe(3)
  })

  it('atravessa a virada de mês sem inventar data', () => {
    expect(calcularDesde('2026-08-01')).toBe('2026-07-29')
  })

  it('sem espelho ainda, pede desde o primeiro dia com venda', () => {
    expect(calcularDesde(null)).toBe(PRIMEIRO_DIA)
  })

  it('não recua para antes do primeiro dia com venda', () => {
    expect(calcularDesde('2026-05-02')).toBe(PRIMEIRO_DIA)
  })

  it('data corrompida não vira NaN silencioso', () => {
    expect(calcularDesde('não é data')).toBe(PRIMEIRO_DIA)
  })
})

describe('decidirSeGrava', () => {
  it('grava quando veio dado', () => {
    expect(decidirSeGrava(1700, 1500)).toEqual({ grava: true })
  })

  it('grava a primeira carga mesmo vindo vazia — não há o que proteger', () => {
    expect(decidirSeGrava(0, 0)).toEqual({ grava: true })
  })

  // Esta é a trava que impede o cron verde de apagar o histórico.
  it('recusa gravar quando a origem vem vazia e o espelho já tem dado', () => {
    const veredicto = decidirSeGrava(0, 1500)
    expect(veredicto.grava).toBe(false)
    expect(veredicto.grava === false && veredicto.motivo).toContain('1500')
  })
})

const espelho = (over: Partial<LinhaEspelho> = {}): LinhaEspelho => ({
  dia: '2026-08-30',
  loja_codigo: '101',
  loja_nome: 'Eunápolis Centro',
  loja_tipo: 'supermercado',
  uf: 'BA',
  produto_codigo: '29943',
  produto_nome: 'CAFE PCT TORRAO 250G TRADICIONAL',
  venda_qtd: 10,
  venda_valor: 120,
  estoque_qtd: null,
  ...over,
})

describe('ancoraDaJanela', () => {
  it('é o último dia COM VENDA, não o último dia da tabela', () => {
    const linhas = [
      espelho({ dia: '2026-08-28', venda_qtd: 5 }),
      // dia mais recente, mas só com foto de estoque: não pode puxar a janela
      espelho({ dia: '2026-08-30', venda_qtd: null, venda_valor: null, estoque_qtd: 300 }),
    ]
    expect(ancoraDaJanela(linhas)).toBe('2026-08-28')
  })

  it('devolve nulo quando não há venda nenhuma', () => {
    expect(ancoraDaJanela([espelho({ venda_qtd: null, venda_valor: null })])).toBeNull()
    expect(ancoraDaJanela([])).toBeNull()
  })
})

describe('resumirPorLoja', () => {
  it('ordena por número da loja — 5 antes de 10, e 10 antes de 101', () => {
    const linhas = [
      espelho({ loja_codigo: '101' }),
      espelho({ loja_codigo: '5' }),
      espelho({ loja_codigo: '10' }),
    ]
    expect(resumirPorLoja(linhas).map((r) => r.lojaCodigo)).toEqual(['5', '10', '101'])
  })

  it('soma a venda da janela e calcula para quantos dias o estoque dá', () => {
    // 30 dias de 5 unidades = 150 na janela -> média 5/dia; 300 em estoque -> 60 dias
    const linhas: LinhaEspelho[] = []
    for (let i = 0; i < JANELA_DIAS; i++) {
      const d = new Date(Date.UTC(2026, 7, 30) - i * 86400000).toISOString().slice(0, 10)
      linhas.push(espelho({ dia: d, venda_qtd: 5, venda_valor: 60 }))
    }
    linhas.push(espelho({ dia: '2026-08-30', venda_qtd: null, venda_valor: null, estoque_qtd: 300 }))

    const [loja] = resumirPorLoja(linhas)
    expect(loja.vendaQtd).toBe(150)
    expect(loja.coberturaDias).toBe(60)
  })

  // Infinity na tela vira "∞ dias", que se lê como "sobra muito" — quando a verdade é
  // "não dá para saber".
  it('não inventa cobertura quando não houve venda na janela', () => {
    const linhas = [
      espelho({ dia: '2026-08-30', venda_qtd: null, venda_valor: null, estoque_qtd: 300 }),
    ]
    const [loja] = resumirPorLoja(linhas)
    expect(loja.coberturaDias).toBeNull()
    expect(loja.estoqueQtd).toBe(300)
  })

  it('o estoque da loja é a foto MAIS RECENTE, somando os produtos daquele dia', () => {
    const linhas = [
      espelho({ dia: '2026-08-30', venda_qtd: 30, venda_valor: 300 }),
      espelho({ dia: '2026-08-29', produto_codigo: '29943', venda_qtd: null, estoque_qtd: 999 }),
      espelho({ dia: '2026-08-30', produto_codigo: '29943', venda_qtd: null, estoque_qtd: 200 }),
      espelho({ dia: '2026-08-30', produto_codigo: '29944', venda_qtd: null, estoque_qtd: 50 }),
    ]
    const [loja] = resumirPorLoja(linhas)
    expect(loja.diaDoEstoque).toBe('2026-08-30')
    expect(loja.estoqueQtd).toBe(250) // 200 + 50, e não 999 do dia anterior
  })

  it('não conta venda anterior à janela', () => {
    const linhas = [
      espelho({ dia: '2026-08-30', venda_qtd: 10, venda_valor: 100 }),
      espelho({ dia: '2026-06-01', venda_qtd: 999, venda_valor: 9990 }),
    ]
    const [loja] = resumirPorLoja(linhas)
    expect(loja.vendaQtd).toBe(10)
    // mas o último dia com venda continua sendo registrado
    expect(loja.ultimoDiaComVenda).toBe('2026-08-30')
  })
})

describe('ehPontoDeVenda', () => {
  it('CD não é ponto de venda — a saída dele é abastecimento', () => {
    expect(ehPontoDeVenda('cd')).toBe(false)
    expect(ehPontoDeVenda('supermercado')).toBe(true)
    expect(ehPontoDeVenda('atacado')).toBe(true)
  })
})

describe('abrir a loja nos produtos', () => {
  it('separa os dois cafés dentro da mesma loja', () => {
    const linhas = [
      espelho({ produto_codigo: '29943', produto_nome: '250G', venda_qtd: 10, venda_valor: 120 }),
      espelho({ produto_codigo: '29944', produto_nome: '500G', venda_qtd: 4, venda_valor: 98 }),
    ]
    const [loja] = resumirPorLoja(linhas)
    expect(loja.vendaQtd).toBe(14)
    expect(loja.produtos.map((p) => p.produtoCodigo)).toEqual(['29943', '29944'])
    expect(loja.produtos[0].vendaQtd).toBe(10)
    expect(loja.produtos[1].vendaQtd).toBe(4)
  })

  // O total da loja tem que ser a soma do que ela abre. Se divergir, um dos dois está
  // errado e não há como saber qual olhando a tela.
  it('o total da loja é exatamente a soma dos produtos que ela abre', () => {
    const linhas = [
      espelho({ produto_codigo: '29943', venda_qtd: 10, venda_valor: 120, estoque_qtd: 300 }),
      espelho({ produto_codigo: '29944', venda_qtd: 4, venda_valor: 98, estoque_qtd: 50 }),
      espelho({ dia: '2026-08-20', produto_codigo: '29943', venda_qtd: 7, venda_valor: 84 }),
    ]
    const [loja] = resumirPorLoja(linhas)
    const somaQtd = loja.produtos.reduce((s, p) => s + p.vendaQtd, 0)
    const somaValor = loja.produtos.reduce((s, p) => s + p.vendaValor, 0)
    expect(somaQtd).toBe(loja.vendaQtd)
    expect(somaValor).toBeCloseTo(loja.vendaValor, 2)
    expect(loja.estoqueQtd).toBe(350)
  })

  it('cada produto tem cobertura própria', () => {
    const linhas: LinhaEspelho[] = []
    for (let i = 0; i < JANELA_DIAS; i++) {
      const d = new Date(Date.UTC(2026, 7, 30) - i * 86400000).toISOString().slice(0, 10)
      linhas.push(espelho({ dia: d, produto_codigo: '29943', venda_qtd: 5, venda_valor: 60 }))
    }
    linhas.push(
      espelho({ dia: '2026-08-30', produto_codigo: '29943', venda_qtd: null, estoque_qtd: 300 }),
      // 500G tem estoque mas nenhuma venda: cobertura não pode ser inventada
      espelho({ dia: '2026-08-30', produto_codigo: '29944', venda_qtd: null, estoque_qtd: 80 }),
    )
    const [loja] = resumirPorLoja(linhas)
    const p250 = loja.produtos.find((p) => p.produtoCodigo === '29943')!
    const p500 = loja.produtos.find((p) => p.produtoCodigo === '29944')!
    expect(p250.coberturaDias).toBe(60)
    expect(p500.coberturaDias).toBeNull()
    expect(p500.estoqueQtd).toBe(80)
  })
})

describe('resumirRede', () => {
  const loja = (over: Partial<ReturnType<typeof resumirPorLoja>[number]> = {}) => ({
    lojaCodigo: '101',
    lojaNome: 'Eunápolis Centro',
    lojaTipo: 'supermercado',
    uf: 'BA',
    vendaQtd: 300,
    vendaValor: 3600,
    vmd: 10,
    estoqueQtd: 300,
    diaDoEstoque: '2026-08-30',
    coberturaDias: 30,
    ultimoDiaComVenda: '2026-08-30',
    produtos: [],
    ...over,
  })

  it('soma venda, valor e estoque das lojas recebidas', () => {
    const rede = resumirRede([loja(), loja({ lojaCodigo: '122', vendaQtd: 200, vendaValor: 2400, estoqueQtd: 100 })])
    expect(rede.vendaQtd).toBe(500)
    expect(rede.vendaValor).toBe(6000)
    expect(rede.estoqueQtd).toBe(400)
    expect(rede.lojas).toBe(2)
  })

  it('conta as lojas apertadas pelo mesmo corte da tela', () => {
    const rede = resumirRede([
      loja({ coberturaDias: COBERTURA_CURTA - 1 }),
      loja({ lojaCodigo: '122', coberturaDias: COBERTURA_CURTA }),
      loja({ lojaCodigo: '130', coberturaDias: null }),
    ])
    expect(rede.apertadas).toBe(1)
  })

  // Quem soma é a tela, que já filtrou o CD. Se o CD entrasse, o mesmo café seria contado
  // na saída do CD e de novo na venda da loja.
  it('soma exatamente as lojas que recebeu, sem filtrar por conta própria', () => {
    const rede = resumirRede([loja({ lojaTipo: 'cd', vendaQtd: 1000, vendaValor: 8500 })])
    expect(rede.vendaQtd).toBe(1000)
    expect(rede.lojas).toBe(1)
  })

  it('rede sem estoque nenhum não inventa cobertura', () => {
    const rede = resumirRede([loja({ estoqueQtd: null, coberturaDias: null })])
    expect(rede.estoqueQtd).toBeNull()
    expect(rede.coberturaDias).toBeNull()
  })
})

describe('VMD', () => {
  it('divide pelos dias CORRIDOS da janela, não pelos dias com venda', () => {
    // 3 dias de venda de 30 dentro de uma janela de 30 dias = 90/30 = 3 por dia,
    // e não 90/3 = 30. A régua tem de ser a mesma da cobertura logo ao lado.
    const linhas = [
      espelho({ dia: '2026-08-30', venda_qtd: 30, venda_valor: 360 }),
      espelho({ dia: '2026-08-29', venda_qtd: 30, venda_valor: 360 }),
      espelho({ dia: '2026-08-28', venda_qtd: 30, venda_valor: 360 }),
    ]
    const [loja] = resumirPorLoja(linhas)
    expect(loja.vendaQtd).toBe(90)
    expect(loja.vmd).toBe(3)
  })

  it('a VMD da loja fecha com a soma da VMD dos produtos que ela abre', () => {
    const linhas = [
      espelho({ produto_codigo: '29943', venda_qtd: 60, venda_valor: 700 }),
      espelho({ produto_codigo: '29944', venda_qtd: 30, venda_valor: 700 }),
    ]
    const [loja] = resumirPorLoja(linhas)
    const somaVmd = loja.produtos.reduce((s, p) => s + p.vmd, 0)
    expect(somaVmd).toBeCloseTo(loja.vmd, 6)
    expect(loja.vmd).toBe(3)
  })

  it('a VMD da rede é a da venda somada, não a média das médias', () => {
    const linhas = [
      espelho({ loja_codigo: '101', venda_qtd: 60, venda_valor: 700 }),
      espelho({ loja_codigo: '122', venda_qtd: 30, venda_valor: 350 }),
    ]
    const rede = resumirRede(resumirPorLoja(linhas))
    expect(rede.vendaQtd).toBe(90)
    expect(rede.vmd).toBe(3)
  })
})

describe('serieDaLoja', () => {
  it('preenche os dias sem nenhum registro em vez de encurtar o eixo', () => {
    const linhas = [
      espelho({ dia: '2026-08-25', venda_qtd: 5 }),
      espelho({ dia: '2026-08-28', venda_qtd: 7 }),
    ]
    const serie = serieDaLoja(linhas, '101')
    expect(serie.pontos.map((p) => p.dia)).toEqual([
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ])
    expect(serie.pontos[1].vendaQtd).toBeNull()
  })

  // A linha some no buraco em vez de ligar dois pontos distantes: unir fingiria que o
  // estoque andou em linha reta por dias em que ninguém mediu.
  it('conta os dias sem foto de estoque', () => {
    const linhas = [
      espelho({ dia: '2026-08-25', venda_qtd: 5, estoque_qtd: 100 }),
      espelho({ dia: '2026-08-26', venda_qtd: 5 }),
      espelho({ dia: '2026-08-27', venda_qtd: 5, estoque_qtd: 90 }),
    ]
    const serie = serieDaLoja(linhas, '101')
    expect(serie.diasSemFoto).toBe(1)
    expect(serie.pontos[1].estoqueQtd).toBeNull()
  })

  it('o limite desenhado são 30 dias da VMD da própria série', () => {
    const linhas = [
      espelho({ dia: '2026-08-29', venda_qtd: 4, estoque_qtd: 100 }),
      espelho({ dia: '2026-08-30', venda_qtd: 6, estoque_qtd: 94 }),
    ]
    const serie = serieDaLoja(linhas, '101')
    expect(serie.vmd).toBe(5) // 10 em 2 dias
    expect(serie.limiteEstoque).toBe(5 * LIMITE_COBERTURA_DIAS)
  })

  it('sem venda na série não desenha limite — em vez de desenhar em zero', () => {
    const serie = serieDaLoja([espelho({ venda_qtd: null, estoque_qtd: 100 })], '101')
    expect(serie.vmd).toBe(0)
    expect(serie.limiteEstoque).toBeNull()
  })

  it('filtra por produto quando pedido, e soma os dois quando não', () => {
    const linhas = [
      espelho({ dia: '2026-08-30', produto_codigo: '29943', venda_qtd: 10, estoque_qtd: 100 }),
      espelho({ dia: '2026-08-30', produto_codigo: '29944', venda_qtd: 4, estoque_qtd: 40 }),
    ]
    expect(serieDaLoja(linhas, '101').pontos[0]).toMatchObject({ vendaQtd: 14, estoqueQtd: 140 })
    expect(serieDaLoja(linhas, '101', '29944').pontos[0]).toMatchObject({
      vendaQtd: 4,
      estoqueQtd: 40,
    })
  })

  it('loja sem linha nenhuma devolve série vazia, não quebra', () => {
    expect(serieDaLoja([espelho()], '999').pontos).toEqual([])
  })
})
