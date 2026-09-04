import { arredondar2 } from './numero.ts'

/**
 * Item de pedido com o custo congelado dele. `custoUnit` null/ausente = produto sem custo
 * cadastrado no dia do pedido, ou usuário sem permissão de ver custo. Nos dois casos a
 * margem fica indefinida — nunca zero.
 */
export interface ItemComCusto {
  qtdPacotes: number
  subtotal: number
  custoUnit?: number | null
}

export interface Margem {
  receita: number
  /** Custo só dos itens que têm custo congelado. */
  custo: number
  /** null quando algum item não tem custo — margem parcial engana mais do que informa. */
  margem: number | null
  margemPercentual: number | null
  /** true quando existe item e todo item tem custo congelado. */
  completa: boolean
}

export function margemDosItens(itens: ItemComCusto[]): Margem {
  const receita = arredondar2(itens.reduce((soma, i) => soma + i.subtotal, 0))
  const custo = arredondar2(itens.reduce((soma, i) => soma + (i.custoUnit ?? 0) * i.qtdPacotes, 0))
  // `!= null` (cobre null e undefined) e não falsy: custo 0 é custo informado
  // (brinde, amostra) e não pode ser confundido com ausência de custo
  const completa = itens.length > 0 && itens.every((i) => i.custoUnit != null)
  const margem = completa ? arredondar2(receita - custo) : null
  return {
    receita,
    custo,
    margem,
    margemPercentual: margem !== null && receita > 0 ? arredondar2((margem / receita) * 100) : null,
    completa,
  }
}

export function margemDoPeriodo(pedidos: { itens: ItemComCusto[] }[]): Margem {
  return margemDosItens(pedidos.flatMap((p) => p.itens))
}

/**
 * Custo por kg quando ele é o MESMO em todos os produtos — e null quando não é.
 *
 * Serve para a nota do ERP entrar na margem. A nota diz quantos kg de café torrado saíram,
 * mas não diz qual produto foi; e sem saber o produto não dá para pegar o custo... **a não
 * ser que o custo por kg seja igual nos dois**. Hoje é: 250g a R$ 6,50 e 500g a R$ 13,00
 * dão os mesmos R$ 26,00/kg — é o mesmo café, embalado diferente.
 *
 * No dia em que os custos por kg divergirem, isto devolve null e a margem volta a ser só
 * dos pedidos do app. Melhor recusar do que apresentar um número que depende de adivinhar
 * qual produto foi na nota.
 */
export function custoPorKgUnico(
  produtos: { pesoKg: number; custoUnit: number | null | undefined }[],
): number | null {
  const porKg = produtos
    .filter((produto) => produto.custoUnit != null && produto.pesoKg > 0)
    .map((produto) => arredondar2((produto.custoUnit as number) / produto.pesoKg))
  if (porKg.length === 0) return null
  return porKg.every((custo) => custo === porKg[0]) ? porKg[0] : null
}
