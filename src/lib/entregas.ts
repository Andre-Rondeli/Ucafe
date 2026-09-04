import { arredondar2 } from './numero.ts'
import { MULTIPLO_KG, pacotesPorCaixa } from './preco.ts'

/**
 * Fardo é a medida que o motorista confere na carga: 1 fardo = MULTIPLO_KG (5 kg).
 * Fração aparece como fração (1,5) — arredondar esconderia carga faltando no carro.
 */
export function fardosDeKg(kg: number): number {
  return arredondar2(kg / MULTIPLO_KG)
}

/** Fardos de um item do pedido. null quando o peso do pacote não divide o fardo. */
export function fardosDoItem(qtdPacotes: number, pesoUnitarioKg: number): number | null {
  const porFardo = pacotesPorCaixa(pesoUnitarioKg)
  if (porFardo === null) return null
  return arredondar2(qtdPacotes / porFardo)
}

export interface GrupoEntrega<T> {
  dia: string
  /** Data prevista já passou — vai no topo e em destaque. */
  atrasado: boolean
  entregas: T[]
  kg: number
  fardos: number
}

interface Entregavel {
  dataEntregaPrevista: string
  totalKg: number
}

export function agruparEntregas<T extends Entregavel>(entregas: T[], hoje: string): GrupoEntrega<T>[] {
  const porDia = new Map<string, T[]>()
  for (const entrega of entregas) {
    const lista = porDia.get(entrega.dataEntregaPrevista)
    if (lista) lista.push(entrega)
    else porDia.set(entrega.dataEntregaPrevista, [entrega])
  }
  // ISO YYYY-MM-DD ordena como texto — sem Date, sem fuso
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, doDia]) => {
      const kg = arredondar2(doDia.reduce((soma, e) => soma + e.totalKg, 0))
      return { dia, atrasado: dia < hoje, entregas: doDia, kg, fardos: fardosDeKg(kg) }
    })
}

/** O que precisa entrar no carro hoje: as atrasadas mais as de hoje. */
export function cargaDoDia<T extends Entregavel>(entregas: T[], hoje: string) {
  const doDia = entregas.filter((e) => e.dataEntregaPrevista <= hoje)
  const kg = arredondar2(doDia.reduce((soma, e) => soma + e.totalKg, 0))
  return { quantidade: doDia.length, kg, fardos: fardosDeKg(kg) }
}
