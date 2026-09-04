import { margemDosItens } from './margem.ts'
import { addDias, diffDias, segundaDaSemana } from './data.ts'
import { arredondar2 } from './numero.ts'
import { faixaVigente } from './preco.ts'
import {
  KG_POR_SKU,
  SKUS,
  type Canal,
  type CondicaoPagamento,
  type FaixaPreco,
  type ItemPrecificado,
  type Produto,
  type Sku,
  type StatusPedido,
} from './tipos.ts'

/**
 * Uma venda lançada no app.
 *
 * `canal` e `condicao` são anuláveis: preencher no chute mentiria justamente nos números
 * que decidem mix de canal e prazo médio da carteira. Nulo fica de fora da conta, em vez
 * de virar um valor inventado.
 */
export interface PedidoMetrica {
  data: string
  clienteId: string
  clienteNome: string
  canal: Canal | null
  condicao: CondicaoPagamento | null
  status: StatusPedido
  totalKg: number
  totalValor: number
  itens: ItemPrecificado[]
}

/** Pedido cancelado não entra em métrica nenhuma. Genérico: preserva campos extras (ex.: PedidoCompleto) do chamador. */
export function apenasValidos<T extends PedidoMetrica>(pedidos: T[]): T[] {
  return pedidos.filter((pedido) => pedido.status !== 'cancelado')
}

export function noPeriodo<T extends PedidoMetrica>(pedidos: T[], inicio: string, fim: string): T[] {
  return pedidos.filter((pedido) => pedido.data >= inicio && pedido.data <= fim)
}

export function resumo(pedidos: PedidoMetrica[]): {
  kg: number
  receita: number
  quantidade: number
  ticketMedio: number
  precoMedioKg: number
} {
  const kg = arredondar2(pedidos.reduce((soma, p) => soma + p.totalKg, 0))
  const receita = arredondar2(pedidos.reduce((soma, p) => soma + p.totalValor, 0))
  const quantidade = pedidos.length
  return {
    kg,
    receita,
    quantidade,
    ticketMedio: quantidade === 0 ? 0 : arredondar2(receita / quantidade),
    precoMedioKg: kg === 0 ? 0 : arredondar2(receita / kg),
  }
}

/**
 * Preço realizado vs tabela: expõe o desconto que o vendedor deu de fato.
 * O preço de tabela é reconstruído com a faixa vigente na data de cada pedido.
 */
export function precoRealizadoVsTabela(
  pedidos: PedidoMetrica[],
  faixas: FaixaPreco[],
): { realizadoKg: number; tabelaKg: number; descontoPercentual: number } | null {
  let kg = 0
  let realizado = 0
  let tabela = 0

  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      // produto novo (sem sku legado) não tem faixa nessa tabela por SKU — fica de fora
      // desta métrica legada; ver mixPorProduto para o indicador que já cobre produto novo
      if (!item.sku) continue
      const faixa = faixaVigente(faixas, item.sku, pedido.totalKg, pedido.data)
      if (!faixa) continue
      kg += KG_POR_SKU[item.sku] * item.qtdPacotes
      realizado += item.subtotal
      tabela += faixa.precoUnit * item.qtdPacotes
    }
  }

  if (kg === 0 || tabela === 0) return null
  const realizadoKg = arredondar2(realizado / kg)
  const tabelaKg = arredondar2(tabela / kg)
  return {
    realizadoKg,
    tabelaKg,
    descontoPercentual: arredondar2(((tabelaKg - realizadoKg) / tabelaKg) * 100),
  }
}

export function mixPorSku(
  pedidos: PedidoMetrica[],
): { sku: Sku; pacotes: number; kg: number; receita: number }[] {
  return SKUS.map((sku) => {
    const itens = pedidos.flatMap((p) => p.itens.filter((item) => item.sku === sku))
    const pacotes = itens.reduce((soma, item) => soma + item.qtdPacotes, 0)
    return {
      sku,
      pacotes,
      kg: arredondar2(pacotes * KG_POR_SKU[sku]),
      receita: arredondar2(itens.reduce((soma, item) => soma + item.subtotal, 0)),
    }
  })
}

/**
 * Mix por produto: equivalente a mixPorSku, mas agrupando pelo produto_id do item
 * (todo item de pedido_itens tem produto_id). Quando um item só tiver sku (registro
 * legado sem produto_id resolvido), agrupa pelo rótulo do sku pra não sumir a venda.
 */
export function mixPorProduto(
  pedidos: PedidoMetrica[],
  produtos: Produto[],
): { produtoId: string | null; nome: string; pacotes: number; kg: number; receita: number }[] {
  interface Grupo {
    produtoId: string | null
    nome: string
    pacotes: number
    kg: number
    receita: number
  }
  const grupos = new Map<string, Grupo>()

  for (const pedido of pedidos) {
    for (const item of pedido.itens) {
      const produtoId = item.produtoId ?? null
      const produto = produtoId ? produtos.find((p) => p.id === produtoId) : undefined
      const pesoKg = produto?.pesoKg ?? (item.sku ? KG_POR_SKU[item.sku] : null)
      if (pesoKg === null) continue // sem produto e sem sku: não há peso para calcular kg
      const chave = produtoId ?? `sku:${item.sku}`
      const nome = produto?.nome ?? item.sku ?? 'Produto removido'
      const atual = grupos.get(chave) ?? { produtoId, nome, pacotes: 0, kg: 0, receita: 0 }
      atual.pacotes += item.qtdPacotes
      atual.kg += pesoKg * item.qtdPacotes
      atual.receita += item.subtotal
      grupos.set(chave, atual)
    }
  }

  return [...grupos.values()]
    .map((g) => ({ ...g, kg: arredondar2(g.kg), receita: arredondar2(g.receita) }))
    .sort((a, b) => b.receita - a.receita)
}

export function seriePorSemana(
  pedidos: PedidoMetrica[],
): { semana: string; kg: number; receita: number }[] {
  const porSemana = new Map<string, { kg: number; receita: number }>()
  for (const pedido of pedidos) {
    const semana = segundaDaSemana(pedido.data)
    const atual = porSemana.get(semana) ?? { kg: 0, receita: 0 }
    porSemana.set(semana, {
      kg: atual.kg + pedido.totalKg,
      receita: atual.receita + pedido.totalValor,
    })
  }
  return [...porSemana.entries()]
    .map(([semana, valores]) => ({
      semana,
      kg: arredondar2(valores.kg),
      receita: arredondar2(valores.receita),
    }))
    .sort((a, b) => a.semana.localeCompare(b.semana))
}

export function rankingClientes(
  pedidos: PedidoMetrica[],
  limite: number,
): { clienteId: string; clienteNome: string; kg: number; receita: number }[] {
  const porCliente = new Map<string, { clienteNome: string; kg: number; receita: number }>()
  for (const pedido of pedidos) {
    const atual = porCliente.get(pedido.clienteId) ?? {
      clienteNome: pedido.clienteNome,
      kg: 0,
      receita: 0,
    }
    porCliente.set(pedido.clienteId, {
      clienteNome: pedido.clienteNome,
      kg: atual.kg + pedido.totalKg,
      receita: atual.receita + pedido.totalValor,
    })
  }
  return [...porCliente.entries()]
    .map(([clienteId, valores]) => ({
      clienteId,
      clienteNome: valores.clienteNome,
      kg: arredondar2(valores.kg),
      receita: arredondar2(valores.receita),
    }))
    .sort((a, b) => b.receita - a.receita)
    .slice(0, limite)
}

/** `canal: null` = venda sem canal conhecido — fica num balde próprio, não no chute. */
export interface MargemDoCliente {
  clienteId: string
  clienteNome: string
  receita: number
  custo: number
  /** null quando falta custo em algum item — margem pela metade engana mais que informa. */
  margem: number | null
  margemPercentual: number | null
}

/**
 * Margem de cada cliente na janela, do que mais deixa dinheiro para o que menos deixa.
 *
 * Substituiu "quem paga mais devagar" no painel a pedido do Carlos, e a troca faz sentido:
 * prazo é uma pergunta de caixa, e a nota do ERP já responde melhor no bloco de recebíveis.
 * Aqui a pergunta é outra — **onde o dinheiro fica**.
 *
 * Ordena por margem em R$, não em %: 40% de R$ 500 não paga a conta que 12% de R$ 40 mil
 * paga. O percentual vai junto porque é ele que mostra quem está sendo vendido barato.
 * Cliente sem custo conhecido em algum item fica com margem null e aparece no fim.
 */
export function margemPorCliente(pedidos: PedidoMetrica[]): MargemDoCliente[] {
  const porCliente = new Map<string, { nome: string; itens: ItemPrecificado[] }>()
  for (const pedido of pedidos) {
    const atual = porCliente.get(pedido.clienteId) ?? { nome: pedido.clienteNome, itens: [] }
    atual.itens.push(...pedido.itens)
    porCliente.set(pedido.clienteId, atual)
  }

  return [...porCliente.entries()]
    .map(([clienteId, cliente]) => {
      const margem = margemDosItens(cliente.itens)
      return {
        clienteId,
        clienteNome: cliente.nome,
        receita: margem.receita,
        custo: margem.custo,
        margem: margem.margem,
        margemPercentual: margem.margemPercentual,
      }
    })
    .sort((a, b) => (b.margem ?? -Infinity) - (a.margem ?? -Infinity))
}

export function porCanal(
  pedidos: PedidoMetrica[],
): { canal: Canal | null; kg: number; receita: number }[] {
  const porCanalMapa = new Map<Canal | null, { kg: number; receita: number }>()
  for (const pedido of pedidos) {
    const atual = porCanalMapa.get(pedido.canal) ?? { kg: 0, receita: 0 }
    porCanalMapa.set(pedido.canal, {
      kg: atual.kg + pedido.totalKg,
      receita: atual.receita + pedido.totalValor,
    })
  }
  return [...porCanalMapa.entries()]
    .map(([canal, valores]) => ({
      canal,
      kg: arredondar2(valores.kg),
      receita: arredondar2(valores.receita),
    }))
    .sort((a, b) => b.receita - a.receita)
}

/**
 * Agrupa pedidos por dia, do mais recente para o mais antigo — a lista do Relatorio.
 * Cancelado fica na lista do dia (a tela decide se mostra riscado) mas nunca entra no
 * subtotal. Dia sem pedido nenhum simplesmente não aparece — não há intervalo pra
 * preencher, é a lista de dias que tiveram pedido.
 */
export function agruparPorDia<T extends PedidoMetrica>(
  pedidos: T[],
): { dia: string; kg: number; valor: number; pedidos: T[] }[] {
  const porDia = new Map<string, T[]>()
  for (const pedido of pedidos) {
    const doDia = porDia.get(pedido.data) ?? []
    doDia.push(pedido)
    porDia.set(pedido.data, doDia)
  }
  return [...porDia.entries()]
    .map(([dia, doDia]) => {
      const validos = apenasValidos(doDia)
      return {
        dia,
        kg: arredondar2(validos.reduce((soma, p) => soma + p.totalKg, 0)),
        valor: arredondar2(validos.reduce((soma, p) => soma + p.totalValor, 0)),
        pedidos: doDia,
      }
    })
    .sort((a, b) => b.dia.localeCompare(a.dia))
}

export type Periodo = 'hoje' | 'semana' | 'mes'

export interface JanelaPeriodo {
  inicio: string
  fim: string
  rotulo: string
}

const ROTULO_PERIODO: Record<Periodo, string> = {
  hoje: 'Hoje',
  semana: 'Esta semana',
  mes: 'Este mês',
}

/** Janela do período contando a partir de `hoje`. `semana` = segunda a hoje. `mes` = dia 1 a hoje. */
export function janelaPeriodo(periodo: Periodo, hoje: string): JanelaPeriodo {
  const inicio =
    periodo === 'hoje'
      ? hoje
      : periodo === 'semana'
        ? segundaDaSemana(hoje)
        : `${hoje.slice(0, 7)}-01`
  return { inicio, fim: hoje, rotulo: ROTULO_PERIODO[periodo] }
}

/** Janela imediatamente anterior, de mesmo tamanho, para comparação justa. */
export function janelaAnterior(janela: JanelaPeriodo): { inicio: string; fim: string } {
  const tamanho = diffDias(janela.inicio, janela.fim)
  return {
    inicio: addDias(janela.inicio, -(tamanho + 1)),
    fim: addDias(janela.inicio, -1),
  }
}

export interface Comparativo {
  atual: { kg: number; receita: number; quantidade: number }
  anterior: { kg: number; receita: number; quantidade: number }
  /** null quando o anterior foi zero — não dá para dividir por zero. */
  variacaoReceitaPct: number | null
  variacaoKgPct: number | null
}

function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return arredondar2(((atual - anterior) / anterior) * 100)
}

/** Compara o período selecionado com o período anterior de mesmo tamanho — a régua do "Hoje". */
export function comparativoPeriodo(
  pedidos: PedidoMetrica[],
  periodo: Periodo,
  hoje: string,
): Comparativo {
  const validos = apenasValidos(pedidos)
  const janela = janelaPeriodo(periodo, hoje)
  const anterior = janelaAnterior(janela)

  const atual = resumo(noPeriodo(validos, janela.inicio, janela.fim))
  const doAnterior = resumo(noPeriodo(validos, anterior.inicio, anterior.fim))

  return {
    atual: { kg: atual.kg, receita: atual.receita, quantidade: atual.quantidade },
    anterior: { kg: doAnterior.kg, receita: doAnterior.receita, quantidade: doAnterior.quantidade },
    variacaoReceitaPct: variacaoPercentual(atual.receita, doAnterior.receita),
    variacaoKgPct: variacaoPercentual(atual.kg, doAnterior.kg),
  }
}

/**
 * Base de clientes na janela. "Perdidos" compara com a janela anterior de mesmo tamanho:
 * comprou antes, não comprou agora.
 */
export function baseDeClientes(
  pedidos: PedidoMetrica[],
  inicio: string,
  fim: string,
): { ativos: number; novos: number; perdidos: number } {
  const validos = apenasValidos(pedidos)
  const tamanho = diffDias(inicio, fim)
  const inicioAnterior = addDias(inicio, -(tamanho + 1))
  const fimAnterior = addDias(inicio, -1)

  const naJanela = new Set(noPeriodo(validos, inicio, fim).map((p) => p.clienteId))
  const naAnterior = new Set(
    noPeriodo(validos, inicioAnterior, fimAnterior).map((p) => p.clienteId),
  )

  const primeiraCompra = new Map<string, string>()
  for (const pedido of validos) {
    const atual = primeiraCompra.get(pedido.clienteId)
    if (!atual || pedido.data < atual) primeiraCompra.set(pedido.clienteId, pedido.data)
  }

  let novos = 0
  for (const clienteId of naJanela) {
    const primeira = primeiraCompra.get(clienteId)
    if (primeira && primeira >= inicio && primeira <= fim) novos += 1
  }

  let perdidos = 0
  for (const clienteId of naAnterior) {
    if (!naJanela.has(clienteId)) perdidos += 1
  }

  return { ativos: naJanela.size, novos, perdidos }
}
