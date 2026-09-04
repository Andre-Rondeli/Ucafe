import { describe, expect, it } from 'vitest'
import { montarFila, type ClienteDaFila } from './fila-recompra'
import { porCliente } from './insights'
import type { PedidoMetrica } from './metricas-venda'

function pedido(clienteId: string, data: string, totalKg: number): PedidoMetrica {
  return {
    data,
    clienteId,
    clienteNome: `Nome antigo de ${clienteId}`,
    canal: 'revenda',
    condicao: 'avista',
    status: 'entregue',
    totalKg,
    totalValor: totalKg * 40,
    itens: [],
  }
}

function cliente(id: string, extra: Partial<ClienteDaFila> = {}): ClienteDaFila {
  return { id, nome: `Cliente ${id}`, cidade: 'Uberlândia', whatsapp: '34999990000', ativo: true, ...extra }
}

const HOJE = '2026-08-27'

function fila(pedidos: PedidoMetrica[], clientes: ClienteDaFila[], cadencias: Record<string, number | null> = {}) {
  return montarFila(porCliente(pedidos, cadencias, HOJE), clientes)
}

describe('montarFila', () => {
  it('separa quem passou da data de quem ainda vai vencer', () => {
    const pedidos = [
      // c1: compra a cada 10 dias, última em 01/08 -> previsto 11/08, 16 dias de atraso
      pedido('c1', '2026-07-12', 20),
      pedido('c1', '2026-07-22', 20),
      pedido('c1', '2026-08-01', 20),
      // c2: a cada 10 dias, última em 20/08 -> previsto 30/08, faltam 3 dias
      pedido('c2', '2026-07-31', 10),
      pedido('c2', '2026-08-10', 10),
      pedido('c2', '2026-08-20', 10),
    ]
    const { vencidos, aVencer } = fila(pedidos, [cliente('c1'), cliente('c2')])
    expect(vencidos.map((i) => i.clienteId)).toEqual(['c1'])
    expect(vencidos[0].atrasoDias).toBe(16)
    expect(aVencer.map((i) => i.clienteId)).toEqual(['c2'])
    expect(aVencer[0].atrasoDias).toBe(-3)
  })

  it('leva o que a ligação precisa junto: quanto sugerir, telefone e última compra', () => {
    const pedidos = [
      pedido('c1', '2026-07-12', 30),
      pedido('c1', '2026-07-22', 30),
      pedido('c1', '2026-08-01', 30),
    ]
    const [item] = fila(pedidos, [cliente('c1')]).vencidos
    expect(item.sugestaoKg).toBe(30)
    expect(item.whatsapp).toBe('34999990000')
    expect(item.ultimaCompra).toBe('2026-08-01')
    expect(item.kgUltimo).toBe(30)
    expect(item.cadenciaDias).toBe(10)
  })

  it('mostra o nome do CADASTRO, não o que veio gravado na venda', () => {
    // a nota do ERP carrega razão social; quem lê a fila procura pelo nome que usa
    const pedidos = [pedido('c1', '2026-07-12', 20), pedido('c1', '2026-07-22', 20)]
    const [item] = fila(pedidos, [cliente('c1', { nome: 'Padaria do Zé' })]).vencidos
    expect(item.clienteNome).toBe('Padaria do Zé')
  })

  it('não põe na fila cliente inativo nem venda do ERP sem cliente atrelado', () => {
    const pedidos = [
      pedido('c1', '2026-07-12', 20),
      pedido('c1', '2026-07-22', 20),
      pedido('agrofacil:88', '2026-07-12', 20),
      pedido('agrofacil:88', '2026-07-22', 20),
    ]
    const { vencidos } = fila(pedidos, [cliente('c1', { ativo: false })])
    expect(vencidos).toEqual([])
  })

  it('ordena do mais atrasado para o menos', () => {
    const pedidos = [
      pedido('c1', '2026-08-01', 20),
      pedido('c1', '2026-08-11', 20), // previsto 21/08 -> 6 dias
      pedido('c2', '2026-07-01', 20),
      pedido('c2', '2026-07-11', 20), // previsto 21/07 -> 37 dias
    ]
    const { vencidos } = fila(pedidos, [cliente('c1'), cliente('c2')])
    expect(vencidos.map((i) => i.clienteId)).toEqual(['c2', 'c1'])
  })

  it('quem comprou uma vez só e não tem cadência sai da fila, mas é declarado', () => {
    // some sem avisar seria pior: a lista pareceria a carteira inteira
    const { vencidos, aVencer, semPrevisao } = fila([pedido('c1', '2026-06-01', 20)], [cliente('c1')])
    expect(vencidos).toEqual([])
    expect(aVencer).toEqual([])
    expect(semPrevisao).toEqual([
      { clienteId: 'c1', clienteNome: 'Cliente c1', ultimaCompra: '2026-06-01' },
    ])
  })

  it('cadência informada no cadastro coloca na fila quem só comprou uma vez', () => {
    const { vencidos, semPrevisao } = fila([pedido('c1', '2026-06-01', 20)], [cliente('c1')], { c1: 30 })
    expect(semPrevisao).toEqual([])
    expect(vencidos[0].atrasoDias).toBe(57) // previsto 01/07
    expect(vencidos[0].origemCadencia).toBe('declarada')
  })

  it('vence hoje conta como "a vencer", não como atrasado', () => {
    const pedidos = [pedido('c1', '2026-08-07', 20), pedido('c1', '2026-08-17', 20)]
    const { vencidos, aVencer } = fila(pedidos, [cliente('c1')])
    expect(vencidos).toEqual([])
    expect(aVencer[0].atrasoDias).toBe(0)
  })
})
