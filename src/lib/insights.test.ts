import { describe, expect, it } from 'vitest'
import { porCliente } from './insights'
import type { PedidoMetrica } from './metricas-venda'

function pedido(clienteId: string, data: string, totalKg: number): PedidoMetrica {
  return {
    data,
    clienteId,
    clienteNome: clienteId === 'c1' ? 'Hotel Praia' : 'Mercadinho Sol',
    canal: 'hotel',
    condicao: 'avista',
    status: 'entregue',
    totalKg,
    totalValor: totalKg * 40,
    itens: [{ sku: '500g', qtdPacotes: totalKg * 2, precoUnit: 20, subtotal: totalKg * 40 }],
  }
}

describe('porCliente', () => {
  const pedidos: PedidoMetrica[] = [
    pedido('c1', '2026-07-04', 20),
    pedido('c1', '2026-07-14', 20),
    pedido('c1', '2026-07-24', 20),
    pedido('c2', '2026-07-20', 10),
  ]

  it('devolve uma linha por cliente com previsao e sinais', () => {
    const linhas = porCliente(pedidos, {}, '2026-08-01')
    const c1 = linhas.find((linha) => linha.clienteId === 'c1')!
    expect(c1.previsao.cadenciaDias).toBe(10)
    expect(c1.previsao.proximaCompraPrevista).toBe('2026-08-03')
    expect(c1.sinais).toContain('na_hora')
    expect(c1.ultimaCompra).toBe('2026-07-24')
    expect(c1.kgUltimo).toBe(20)
  })

  it('cliente com um pedido so fica marcado como novo', () => {
    const c2 = porCliente(pedidos, {}, '2026-08-01').find((linha) => linha.clienteId === 'c2')!
    expect(c2.sinais).toEqual(['novo'])
  })

  it('usa a cadencia declarada quando o cliente ainda nao tem historico', () => {
    const c2 = porCliente(pedidos, { c2: 15 }, '2026-08-01').find(
      (linha) => linha.clienteId === 'c2',
    )!
    expect(c2.previsao.origemCadencia).toBe('declarada')
    expect(c2.previsao.proximaCompraPrevista).toBe('2026-08-04')
  })

  it('ordena pelos mais atrasados primeiro', () => {
    const linhas = porCliente(pedidos, {}, '2026-08-20')
    expect(linhas[0].clienteId).toBe('c1') // 27 dias sem comprar, cadencia 10
  })

  it('ignora pedido cancelado', () => {
    const comCancelado: PedidoMetrica[] = [
      ...pedidos,
      { ...pedido('c1', '2026-08-15', 500), status: 'cancelado' },
    ]
    const c1 = porCliente(comCancelado, {}, '2026-08-01').find((l) => l.clienteId === 'c1')!
    expect(c1.ultimaCompra).toBe('2026-07-24')
  })
})
