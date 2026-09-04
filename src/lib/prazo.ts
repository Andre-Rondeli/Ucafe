import { addDias, segundaDaSemana } from './data.ts'
import { arredondar2 } from './numero.ts'
import type { CondicaoPagamento } from './tipos.ts'

/**
 * Dias de vencimento implícitos de cada condição. null = sem prazo definido
 * (consignado só vira dinheiro na apuração, então fica fora de qualquer projeção).
 * Isto NÃO é contas a receber: quem cobra é o ERP. Aqui é insumo de cálculo.
 */
export const DIAS_POR_CONDICAO: Record<CondicaoPagamento, number[] | null> = {
  avista: [0],
  prazo_7: [7],
  prazo_14: [14],
  prazo_28: [28],
  prazo_30: [30],
  prazo_30_60: [30, 60],
  consignado: null,
}

export interface Vencimento {
  data: string
  valor: number
}

export interface PedidoPrazo {
  data: string
  condicao: CondicaoPagamento
  totalValor: number
}

/** Vencimentos implícitos do pedido. Parcelas iguais; a última absorve a sobra de centavo. */
export function vencimentos(
  dataPedido: string,
  condicao: CondicaoPagamento,
  valorTotal: number,
): Vencimento[] {
  const dias = DIAS_POR_CONDICAO[condicao]
  if (!dias) return []
  const parcela = arredondar2(valorTotal / dias.length)
  return dias.map((d, indice) => {
    const ultima = indice === dias.length - 1
    const valor = ultima ? arredondar2(valorTotal - parcela * (dias.length - 1)) : parcela
    return { data: addDias(dataPedido, d), valor }
  })
}

/** Prazo médio da condição em dias. Null para consignado. */
export function prazoMedioDias(condicao: CondicaoPagamento): number | null {
  const dias = DIAS_POR_CONDICAO[condicao]
  if (!dias) return null
  return dias.reduce((soma, d) => soma + d, 0) / dias.length
}

/** Prazo médio da carteira ponderado por R$ — não por número de pedidos. */
export function prazoMedioPonderado(pedidos: PedidoPrazo[]): number | null {
  let valorTotal = 0
  let somaPonderada = 0
  for (const pedido of pedidos) {
    const prazo = prazoMedioDias(pedido.condicao)
    if (prazo === null) continue
    valorTotal += pedido.totalValor
    somaPonderada += pedido.totalValor * prazo
  }
  if (valorTotal === 0) return null
  return arredondar2(somaPonderada / valorTotal)
}

/**
 * Entrada de caixa PREVISTA por semana, derivada da condição de pagamento.
 * Previsto nunca é realizado: o realizado mora no ERP.
 */
export function caixaPrevistoPorSemana(
  pedidos: PedidoPrazo[],
): { semana: string; valor: number }[] {
  const porSemana = new Map<string, number>()
  for (const pedido of pedidos) {
    for (const vencimento of vencimentos(pedido.data, pedido.condicao, pedido.totalValor)) {
      const semana = segundaDaSemana(vencimento.data)
      porSemana.set(semana, (porSemana.get(semana) ?? 0) + vencimento.valor)
    }
  }
  return [...porSemana.entries()]
    .map(([semana, valor]) => ({ semana, valor: arredondar2(valor) }))
    .sort((a, b) => a.semana.localeCompare(b.semana))
}
