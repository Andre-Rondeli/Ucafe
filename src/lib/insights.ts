import { apenasValidos, type PedidoMetrica } from './metricas-venda.ts'
import {
  estoqueNoCliente,
  prever,
  sinais,
  type EstoqueNoCliente,
  type PrevisaoRecompra,
  type Sinal,
} from './recompra.ts'

export interface LinhaCliente {
  clienteId: string
  clienteNome: string
  previsao: PrevisaoRecompra
  sinais: Sinal[]
  kgUltimo: number
  ultimaCompra: string
  /** Quanto o cliente ainda deve ter na prateleira — `null` quando não há cadência para estimar. */
  estoque: EstoqueNoCliente | null
}

/**
 * Uma linha por cliente com previsão de recompra e sinais, ordenada pelos
 * mais atrasados primeiro — é a fila de ligação do vendedor.
 */
export function porCliente(
  pedidos: PedidoMetrica[],
  cadenciasDeclaradas: Record<string, number | null>,
  hoje: string,
): LinhaCliente[] {
  const agrupado = new Map<string, PedidoMetrica[]>()
  for (const pedido of apenasValidos(pedidos)) {
    const lista = agrupado.get(pedido.clienteId) ?? []
    lista.push(pedido)
    agrupado.set(pedido.clienteId, lista)
  }

  const linhas: LinhaCliente[] = []
  for (const [clienteId, doCliente] of agrupado) {
    const ordenado = [...doCliente].sort((a, b) => a.data.localeCompare(b.data))
    const historico = ordenado.map((pedido) => ({ data: pedido.data, totalKg: pedido.totalKg }))
    const previsao = prever(historico, cadenciasDeclaradas[clienteId] ?? null, hoje)
    const ultimo = ordenado[ordenado.length - 1]
    linhas.push({
      clienteId,
      clienteNome: ultimo.clienteNome,
      previsao,
      sinais: sinais(historico, previsao, hoje),
      kgUltimo: ultimo.totalKg,
      ultimaCompra: ultimo.data,
      estoque: estoqueNoCliente(historico, cadenciasDeclaradas[clienteId] ?? null, hoje),
    })
  }

  return linhas.sort((a, b) => (b.previsao.atrasoDias ?? -9999) - (a.previsao.atrasoDias ?? -9999))
}
