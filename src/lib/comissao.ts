// extensão .ts explícita: este módulo passou a ser importado também pela Edge Function
// `recompra` (Deno exige a extensão), como já acontece com recompra.ts e data.ts
import { arredondar2 } from './numero.ts'

export const PERCENTUAL_PADRAO = 2

export interface RegraComissao {
  percentual: number
  vigenteDesde: string
}

/** Percentual vigente na data: a regra de maior `vigenteDesde` que seja <= data. Sem regra -> PERCENTUAL_PADRAO. */
export function percentualVigente(regras: RegraComissao[], data: string): number {
  const vigentes = regras.filter((r) => r.vigenteDesde <= data)
  if (vigentes.length === 0) return PERCENTUAL_PADRAO

  let escolhida = vigentes[0]
  for (const regra of vigentes) {
    if (regra.vigenteDesde > escolhida.vigenteDesde) escolhida = regra
  }
  // cuidado: percentual pode ser 0, checagem explícita de undefined/null, nunca `||`
  return escolhida.percentual ?? PERCENTUAL_PADRAO
}

export interface BaseComissionavel {
  data: string
  valor: number
  origem: 'pedido' | 'consignado'
}

/** Comissão de uma base: percentual vigente na data da base x valor, arredondado a 2 casas. */
export function comissaoDaBase(base: BaseComissionavel, regras: RegraComissao[]): number {
  const percentual = percentualVigente(regras, base.data)
  return arredondar2((percentual / 100) * base.valor)
}

export interface ResumoComissao {
  baseTotal: number
  comissaoTotal: number
  porOrigem: {
    pedido: { base: number; comissao: number }
    consignado: { base: number; comissao: number }
  }
  quantidade: number
}

/** Soma as bases de um período já filtrado. */
export function resumoComissao(bases: BaseComissionavel[], regras: RegraComissao[]): ResumoComissao {
  const porOrigem = {
    pedido: { base: 0, comissao: 0 },
    consignado: { base: 0, comissao: 0 },
  }

  for (const base of bases) {
    const comissao = comissaoDaBase(base, regras)
    porOrigem[base.origem].base += base.valor
    porOrigem[base.origem].comissao += comissao
  }

  porOrigem.pedido.base = arredondar2(porOrigem.pedido.base)
  porOrigem.pedido.comissao = arredondar2(porOrigem.pedido.comissao)
  porOrigem.consignado.base = arredondar2(porOrigem.consignado.base)
  porOrigem.consignado.comissao = arredondar2(porOrigem.consignado.comissao)

  return {
    baseTotal: arredondar2(porOrigem.pedido.base + porOrigem.consignado.base),
    comissaoTotal: arredondar2(porOrigem.pedido.comissao + porOrigem.consignado.comissao),
    porOrigem,
    quantidade: bases.length,
  }
}

/** Primeiro e último dia do mês de uma data ISO. */
export function limitesDoMes(iso: string): { inicio: string; fim: string } {
  const [ano, mes] = iso.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const mesStr = String(mes).padStart(2, '0')
  return {
    inicio: `${ano}-${mesStr}-01`,
    fim: `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`,
  }
}
