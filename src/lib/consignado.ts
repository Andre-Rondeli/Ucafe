import { addDias, diffDias } from './data.ts'
import { arredondar2 } from './numero.ts'
import { faixaVigenteProduto, MULTIPLO_KG, type FaixaProduto } from './preco.ts'
import { KG_POR_SKU, SKUS, type Sku, type TipoMovConsignado } from './tipos.ts'

export interface MovConsignado {
  sku: Sku
  tipo: TipoMovConsignado
  qtdPacotes: number
  data: string
}

const SINAL: Record<TipoMovConsignado, number> = {
  entrega: 1,
  venda_apurada: -1,
  retorno: -1,
}

/**
 * Saldo em pacotes por SKU. Sempre calculado pela soma dos movimentos —
 * campo `saldo` guardado dessincroniza, soma não.
 */
export function saldoPorSku(movs: MovConsignado[]): Record<Sku, number> {
  const saldo = Object.fromEntries(SKUS.map((sku) => [sku, 0])) as Record<Sku, number>
  for (const mov of movs) {
    saldo[mov.sku] += SINAL[mov.tipo] * mov.qtdPacotes
  }
  return saldo
}

export function saldoKg(movs: MovConsignado[]): number {
  const saldo = saldoPorSku(movs)
  return arredondar2(SKUS.reduce((soma, sku) => soma + saldo[sku] * KG_POR_SKU[sku], 0))
}

function kgDe(movs: MovConsignado[]): number {
  return arredondar2(movs.reduce((soma, m) => soma + m.qtdPacotes * KG_POR_SKU[m.sku], 0))
}

/** Só tipo e data — serve tanto ao movimento por SKU quanto ao por produto. */
interface MovTipoData {
  tipo: TipoMovConsignado
  data: string
}

function primeiraEntrega(movs: MovTipoData[]): string | null {
  const entregas = movs.filter((m) => m.tipo === 'entrega').map((m) => m.data).sort()
  return entregas[0] ?? null
}

/** Ritmo de venda no cliente: kg apurado ÷ dias desde a primeira entrega. */
export function vendaApuradaDiariaKg(movs: MovConsignado[], hoje: string): number | null {
  const apuradas = movs.filter((m) => m.tipo === 'venda_apurada')
  const inicio = primeiraEntrega(movs)
  if (apuradas.length === 0 || inicio === null) return null
  const dias = Math.max(1, diffDias(inicio, hoje))
  return arredondar2(kgDe(apuradas) / dias)
}

/** Dias que o saldo atual ainda cobre no ritmo apurado. Saldo zerado ou negativo = repor agora. */
export function diasRestantes(movs: MovConsignado[], hoje: string): number | null {
  const ritmo = vendaApuradaDiariaKg(movs, hoje)
  if (ritmo === null || ritmo <= 0) return null
  // saldo negativo é inconsistência de lançamento (apurou mais do que entregou);
  // nunca projetar data no passado — o recado operacional é "repor agora"
  return Math.max(0, Math.round(saldoKg(movs) / ritmo))
}

/** Giro: dias desde a última apuração — ou desde a primeira entrega, se nunca apurou. */
export function diasParado(movs: MovTipoData[], hoje: string): number | null {
  const apuradas = movs.filter((m) => m.tipo === 'venda_apurada').map((m) => m.data).sort()
  const referencia = apuradas[apuradas.length - 1] ?? primeiraEntrega(movs)
  if (!referencia) return null
  return diffDias(referencia, hoje)
}

/** Data prevista em que o saldo consignado acaba — o gatilho de reposição. */
export function previsaoReposicao(movs: MovConsignado[], hoje: string): string | null {
  const dias = diasRestantes(movs, hoje)
  if (dias === null) return null
  return addDias(hoje, dias)
}

// ==================================================================================
// Versões por produto — mesma regra de negócio de cima, agora sobre o catálogo
// (produto_id) em vez do enum fixo Sku. As funções por SKU continuam existindo:
// histórico e testes atuais dependem delas (mesmo padrão de preco.ts).
// ==================================================================================

export interface MovConsignadoProduto {
  produtoId: string
  /** Peso do pacote em kg, resolvido pelo catálogo na leitura. */
  pesoKg: number
  tipo: TipoMovConsignado
  qtdPacotes: number
  data: string
}

/** Saldo em pacotes por produto — soma dos movimentos, nunca campo guardado. */
export function saldoPorProduto(movs: MovConsignadoProduto[]): Record<string, number> {
  const saldo: Record<string, number> = {}
  for (const mov of movs) {
    saldo[mov.produtoId] = (saldo[mov.produtoId] ?? 0) + SINAL[mov.tipo] * mov.qtdPacotes
  }
  return saldo
}

export function saldoKgProduto(movs: MovConsignadoProduto[]): number {
  return arredondar2(
    movs.reduce((soma, m) => soma + SINAL[m.tipo] * m.qtdPacotes * m.pesoKg, 0),
  )
}

function kgDeProduto(movs: MovConsignadoProduto[]): number {
  return arredondar2(movs.reduce((soma, m) => soma + m.qtdPacotes * m.pesoKg, 0))
}

/** Ritmo de venda no cliente em kg/dia — equivalente a vendaApuradaDiariaKg. */
export function vendaApuradaDiariaKgProduto(
  movs: MovConsignadoProduto[],
  hoje: string,
): number | null {
  const apuradas = movs.filter((m) => m.tipo === 'venda_apurada')
  const inicio = primeiraEntrega(movs)
  if (apuradas.length === 0 || inicio === null) return null
  const dias = Math.max(1, diffDias(inicio, hoje))
  return arredondar2(kgDeProduto(apuradas) / dias)
}

/** Data prevista em que o saldo consignado acaba — equivalente a previsaoReposicao. */
export function previsaoReposicaoProduto(
  movs: MovConsignadoProduto[],
  hoje: string,
): string | null {
  const ritmo = vendaApuradaDiariaKgProduto(movs, hoje)
  if (ritmo === null || ritmo <= 0) return null
  const dias = Math.max(0, Math.round(saldoKgProduto(movs) / ritmo))
  return addDias(hoje, dias)
}

/**
 * Valor de tabela do café que está no cliente. A faixa é escolhida pelo MENOR volume de
 * pedido (MULTIPLO_KG) porque a tabela é indexada pelo kg do PEDIDO INTEIRO e começa em
 * 5 kg — perguntar a faixa pelo peso de um pacote (0,25 kg) não acha faixa nenhuma e o
 * valor nunca aparecia na tela. Sem faixa vigente para algum produto com saldo devolve
 * null: melhor mostrar só o kg do que inventar dinheiro.
 */
export function valorSaldoConsignado(
  faixas: FaixaProduto[],
  saldo: Record<string, number>,
  hoje: string,
): number | null {
  const comSaldo = Object.keys(saldo).filter((produtoId) => saldo[produtoId] > 0)
  if (comSaldo.length === 0) return null

  let total = 0
  for (const produtoId of comSaldo) {
    const faixa = faixaVigenteProduto(faixas, produtoId, MULTIPLO_KG, hoje)
    if (faixa === null) return null
    total += faixa.precoUnit * saldo[produtoId]
  }
  return arredondar2(total)
}

export type SituacaoConsignado = 'em_dia' | 'vence_em_breve' | 'vencido' | 'sem_prazo'
export const DIAS_ALERTA_CONSIGNADO = 7

/** Situação do prazo isolada do saldo — usada tanto no cálculo cheio quanto na tela de pendências. */
export function situacaoPeloPrazo(
  prazoRetorno: string | null,
  hoje: string,
): { diasParaPrazo: number | null; situacao: SituacaoConsignado } {
  if (prazoRetorno === null) return { diasParaPrazo: null, situacao: 'sem_prazo' }
  const diasParaPrazo = diffDias(hoje, prazoRetorno)
  const situacao: SituacaoConsignado =
    diasParaPrazo < 0
      ? 'vencido'
      : diasParaPrazo <= DIAS_ALERTA_CONSIGNADO
        ? 'vence_em_breve'
        : 'em_dia'
  return { diasParaPrazo, situacao }
}

export interface PendenciaConsignado {
  saldoKg: number
  saldoPorSku: Record<Sku, number>
  prazoRetorno: string | null
  /** positivo = ainda falta; negativo = atrasado. */
  diasParaPrazo: number | null
  situacao: SituacaoConsignado
  diasParado: number | null
  previsaoAcabar: string | null
}

/** Junta saldo, prazo e giro do consignado num objeto só — a régua completa de uma pendência. */
export function pendenciaConsignado(
  movs: MovConsignado[],
  prazoRetorno: string | null,
  hoje: string,
): PendenciaConsignado {
  const { diasParaPrazo, situacao } = situacaoPeloPrazo(prazoRetorno, hoje)
  return {
    saldoKg: saldoKg(movs),
    saldoPorSku: saldoPorSku(movs),
    prazoRetorno,
    diasParaPrazo,
    situacao,
    diasParado: diasParado(movs, hoje),
    previsaoAcabar: previsaoReposicao(movs, hoje),
  }
}
