import { arredondar2 } from './numero.ts'
import {
  KG_POR_SKU,
  type FaixaPreco,
  type ItemPedidoInput,
  type ItemPrecificado,
  type Produto,
  type Sku,
} from './tipos.ts'

/** Kg total do pedido — é isso que define a faixa de volume. */
export function kgTotal(itens: ItemPedidoInput[]): number {
  const kg = itens.reduce((soma, item) => soma + KG_POR_SKU[item.sku] * item.qtdPacotes, 0)
  return arredondar2(kg)
}

/** Data de vigência mais recente que já vigia (<= data) entre as faixas do SKU. */
function versaoVigente(faixas: FaixaPreco[], sku: Sku, data: string): string | null {
  const datas = faixas.filter((f) => f.sku === sku && f.vigenteDesde <= data).map((f) => f.vigenteDesde)
  if (datas.length === 0) return null
  return datas.reduce((maisRecente, atual) => (atual > maisRecente ? atual : maisRecente))
}

/** Faixas do SKU que pertencem à versão vigente na data (não mistura versões). */
function faixasDoSku(faixas: FaixaPreco[], sku: Sku, data: string): FaixaPreco[] {
  const versao = versaoVigente(faixas, sku, data)
  if (versao === null) return []
  return faixas.filter((f) => f.sku === sku && f.vigenteDesde === versao)
}

function contemKg(faixa: FaixaPreco, kg: number): boolean {
  return kg >= faixa.kgMin && (faixa.kgMax === null || kg <= faixa.kgMax)
}

/**
 * Faixa aplicável ao SKU, dado o kg TOTAL do pedido e a data.
 * Reduz primeiro à versão (vigenteDesde) mais recente que já vigia na data e só então
 * procura a faixa que contém o kg — uma versão incompleta nunca cai na versão anterior.
 */
export function faixaVigente(
  faixas: FaixaPreco[],
  sku: Sku,
  kgTotalPedido: number,
  data: string,
): FaixaPreco | null {
  return faixasDoSku(faixas, sku, data).find((f) => contemKg(f, kgTotalPedido)) ?? null
}

/** Faixa imediatamente melhor que a atual — vira argumento de venda ("faltam X kg"). */
export function proximaFaixa(
  faixas: FaixaPreco[],
  sku: Sku,
  kgTotalPedido: number,
  data: string,
): FaixaPreco | null {
  const atual = faixaVigente(faixas, sku, kgTotalPedido, data)
  if (!atual) return null
  const acima = faixasDoSku(faixas, sku, data).filter((f) => f.kgMin > atual.kgMin)
  if (acima.length === 0) return null
  const menorPiso = Math.min(...acima.map((f) => f.kgMin))
  return acima.find((f) => f.kgMin === menorPiso) ?? null
}

/** Precifica os itens aplicando a faixa do kg total. Congela o preço no item. */
export function precificar(
  itens: ItemPedidoInput[],
  faixas: FaixaPreco[],
  data: string,
): ItemPrecificado[] {
  const total = kgTotal(itens)
  return itens
    .filter((item) => item.qtdPacotes > 0)
    .map((item) => {
      const faixa = faixaVigente(faixas, item.sku, total, data)
      if (!faixa) {
        throw new Error(`Sem faixa de preço para ${item.sku} com ${total} kg em ${data}`)
      }
      return {
        sku: item.sku,
        qtdPacotes: item.qtdPacotes,
        precoUnit: faixa.precoUnit,
        subtotal: arredondar2(faixa.precoUnit * item.qtdPacotes),
      }
    })
}

/** Múltiplo em kg em que todo pedido é fechado — regra da operação, não da faixa de preço. */
export const MULTIPLO_KG = 5

/** Verdadeiro quando kg é múltiplo positivo de MULTIPLO_KG (tolerância de ponto flutuante). */
export function ehMultiploValido(kg: number): boolean {
  if (kg <= 0) return false
  const resto = kg % MULTIPLO_KG
  return resto < 0.001 || MULTIPLO_KG - resto < 0.001
}

/** Múltiplos de 5 imediatamente abaixo e acima de kg, para a tela sugerir ajuste. */
export function kgMaisProximos(kg: number): { abaixo: number | null; acima: number } {
  if (ehMultiploValido(kg)) return { abaixo: kg, acima: kg }
  const abaixo = Math.floor(kg / MULTIPLO_KG) * MULTIPLO_KG
  const acima = abaixo + MULTIPLO_KG
  return { abaixo: abaixo > 0 ? abaixo : null, acima }
}

export function totalPedido(itens: ItemPrecificado[]): { totalKg: number; totalValor: number } {
  // produto novo (sem sku legado) não entra nesta soma por SKU — usar totalPedidoProdutos
  const doSku = itens.filter((item): item is ItemPrecificado & { sku: Sku } => item.sku !== null)
  return {
    totalKg: kgTotal(doSku),
    totalValor: arredondar2(itens.reduce((soma, item) => soma + item.subtotal, 0)),
  }
}

/** Faixa de preço em edição na tela — ainda não tem id nem vigência confirmada. */
export interface FaixaParaValidar {
  sku: Sku
  kgMin: number
  kgMax: number | null
  precoUnit: number
}

/** Kg em gramas inteiros — elimina erro de ponto flutuante (25.001 - 25 !== 0.001 em JS). */
function paraGramas(kg: number): number {
  return Math.round(kg * 1000)
}

const MULTIPLO_G = paraGramas(MULTIPLO_KG)

/**
 * Valida a tabela de faixas na grade fechada de 5 em 5 kg (decisão: todo pedido já é
 * múltiplo de MULTIPLO_KG, então o teto de uma faixa e o piso da seguinte são volumes
 * consecutivos reais — não um "furo" de ponto flutuante). Devolve a primeira mensagem de
 * erro em PT-BR, ou null se a tabela está válida. Valida só os SKUs presentes na lista.
 */
export function validarFaixas(faixas: FaixaParaValidar[]): string | null {
  const skusPresentes = [...new Set(faixas.map((f) => f.sku))]

  for (const sku of skusPresentes) {
    const doSku = faixas.filter((f) => f.sku === sku)

    for (const f of doSku) {
      if (!Number.isFinite(f.precoUnit) || f.precoUnit <= 0) {
        return `O preço da faixa de ${f.kgMin} kg do ${sku} está vazio ou inválido. Use vírgula ou ponto, por exemplo 10,50.`
      }
    }

    for (const f of doSku) {
      const valores = f.kgMax === null ? [f.kgMin] : [f.kgMin, f.kgMax]
      for (const kg of valores) {
        if (paraGramas(kg) % MULTIPLO_G !== 0) {
          return `A faixa do ${sku} que começa em ${f.kgMin} kg não é múltipla de 5. Use números fechados: 5, 10, 15, 20…`
        }
      }
    }

    const ordenado = [...doSku].sort((a, b) => a.kgMin - b.kgMin)

    if (paraGramas(ordenado[0].kgMin) !== MULTIPLO_G) {
      return `A primeira faixa do ${sku} começa em ${ordenado[0].kgMin} kg. Ela precisa começar em ${MULTIPLO_KG} kg, que é o pedido mínimo.`
    }

    for (const f of doSku) {
      if (f.kgMax !== null && paraGramas(f.kgMax) <= paraGramas(f.kgMin)) {
        return `A faixa do ${sku} que começa em ${f.kgMin} kg termina em ${f.kgMax} kg. O teto tem que ser maior que o piso.`
      }
    }

    for (let i = 0; i < ordenado.length - 1; i++) {
      const atual = ordenado[i]
      const seguinte = ordenado[i + 1]
      if (atual.kgMax === null) continue
      const tetoG = paraGramas(atual.kgMax)
      const proximoMinG = paraGramas(seguinte.kgMin)
      if (proximoMinG <= tetoG) {
        return `As faixas do ${sku} se sobrepõem: uma vai até ${atual.kgMax} kg e a seguinte já começa em ${seguinte.kgMin} kg.`
      }
      if (proximoMinG !== tetoG + MULTIPLO_G) {
        return `A tabela do ${sku} pula de ${atual.kgMax} kg para ${seguinte.kgMin} kg. A faixa seguinte tem que começar em ${atual.kgMax + MULTIPLO_KG} kg.`
      }
    }

    const semTeto = doSku.filter((f) => f.kgMax === null)
    if (semTeto.length === 0) {
      return `Falta a faixa sem teto do ${sku}. Deixe o campo de kg máximo vazio na última faixa, senão pedido grande fica sem preço.`
    }
    if (semTeto.length > 1) {
      return `O ${sku} tem duas faixas sem teto. Só a última pode ficar sem teto.`
    }
    if (semTeto[0] !== ordenado[ordenado.length - 1]) {
      return `Falta a faixa sem teto do ${sku}. Deixe o campo de kg máximo vazio na última faixa, senão pedido grande fica sem preço.`
    }
  }

  return null
}

// ==================================================================================
// Versões por produto — mesma regra de negócio de cima, agora sobre o catálogo de
// produtos (produto_id) em vez do enum fixo Sku. As funções por SKU acima continuam
// existindo e não mudam: histórico e testes atuais dependem delas.
// ==================================================================================

export interface ItemProdutoInput {
  produtoId: string
  qtdPacotes: number
}

export interface ItemProdutoPrecificado {
  /** De onde saiu o preço: combinado com o cliente ou da faixa de kg. */
  origem?: 'cliente' | 'faixa'
  produtoId: string
  qtdPacotes: number
  precoUnit: number
  subtotal: number
}

export interface FaixaProduto {
  id: string
  produtoId: string
  kgMin: number
  kgMax: number | null
  precoUnit: number
  vigenteDesde: string
}

function pesoDoProduto(produtos: Produto[], produtoId: string): number {
  const produto = produtos.find((p) => p.id === produtoId)
  if (!produto) throw new Error(`Produto ${produtoId} não encontrado no catálogo`)
  return produto.pesoKg
}

function nomeDoProduto(produtos: Produto[], produtoId: string): string {
  return produtos.find((p) => p.id === produtoId)?.nome ?? produtoId
}

/** Kg total do pedido a partir do peso de cada produto — equivalente a kgTotal, por produto. */
export function kgTotalProdutos(itens: ItemProdutoInput[], produtos: Produto[]): number {
  const kg = itens.reduce(
    (soma, item) => soma + pesoDoProduto(produtos, item.produtoId) * item.qtdPacotes,
    0,
  )
  return arredondar2(kg)
}

function versaoVigenteProduto(faixas: FaixaProduto[], produtoId: string, data: string): string | null {
  const datas = faixas
    .filter((f) => f.produtoId === produtoId && f.vigenteDesde <= data)
    .map((f) => f.vigenteDesde)
  if (datas.length === 0) return null
  return datas.reduce((maisRecente, atual) => (atual > maisRecente ? atual : maisRecente))
}

function faixasDoProduto(faixas: FaixaProduto[], produtoId: string, data: string): FaixaProduto[] {
  const versao = versaoVigenteProduto(faixas, produtoId, data)
  if (versao === null) return []
  return faixas.filter((f) => f.produtoId === produtoId && f.vigenteDesde === versao)
}

function contemKgProduto(faixa: FaixaProduto, kg: number): boolean {
  return kg >= faixa.kgMin && (faixa.kgMax === null || kg <= faixa.kgMax)
}

/** Faixa aplicável ao produto, dado o kg TOTAL do pedido e a data — equivalente a faixaVigente. */
export function faixaVigenteProduto(
  faixas: FaixaProduto[],
  produtoId: string,
  kgTotalPedido: number,
  data: string,
): FaixaProduto | null {
  return faixasDoProduto(faixas, produtoId, data).find((f) => contemKgProduto(f, kgTotalPedido)) ?? null
}

/** Faixa imediatamente melhor que a atual — equivalente a proximaFaixa. */
export function proximaFaixaProduto(
  faixas: FaixaProduto[],
  produtoId: string,
  kgTotalPedido: number,
  data: string,
): FaixaProduto | null {
  const atual = faixaVigenteProduto(faixas, produtoId, kgTotalPedido, data)
  if (!atual) return null
  const acima = faixasDoProduto(faixas, produtoId, data).filter((f) => f.kgMin > atual.kgMin)
  if (acima.length === 0) return null
  const menorPiso = Math.min(...acima.map((f) => f.kgMin))
  return acima.find((f) => f.kgMin === menorPiso) ?? null
}

/** Precifica os itens por produto aplicando a faixa do kg total — equivalente a precificar. */
/** Preço combinado com UM cliente para UM produto, com a data em que passou a valer. */
export interface PrecoDeCliente {
  produtoId: string
  precoUnit: number
  /** ISO YYYY-MM-DD. Reajuste é registro novo, não edição. */
  vigenteDesde: string
}

/**
 * Preço combinado com o cliente, vigente na data. null = não há, e vale a faixa.
 *
 * Pega o mais recente que já entrou em vigor — igual à régua das faixas. Preço com data
 * futura fica esperando; preço mais novo substitui o antigo sem apagá-lo.
 */
export function precoClienteVigente(
  precos: PrecoDeCliente[],
  produtoId: string,
  data: string,
): number | null {
  const valendo = precos
    .filter((preco) => preco.produtoId === produtoId && preco.vigenteDesde <= data)
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))
  return valendo.length > 0 ? valendo[0].precoUnit : null
}

/**
 * Preço de cada item do pedido.
 *
 * **O preço combinado com o cliente vence a faixa de kg.** Quando ele existe, o volume do
 * pedido deixa de mudar o valor do pacote — é o que "para esse cliente é sempre o mesmo
 * preço" significa. E a faixa deixa de ser obrigatória: cliente com preço fixo pode
 * comprar qualquer quantidade sem depender de existir faixa para aquele volume.
 *
 * `origem` volta junto porque a tela precisa dizer POR QUE aquele preço — vendedor que vê
 * um número diferente da tabela sem explicação acha que o app quebrou.
 */
export function precificarProdutos(
  itens: ItemProdutoInput[],
  produtos: Produto[],
  faixas: FaixaProduto[],
  data: string,
  precosCliente: PrecoDeCliente[] = [],
): ItemProdutoPrecificado[] {
  const total = kgTotalProdutos(itens, produtos)
  return itens
    .filter((item) => item.qtdPacotes > 0)
    .map((item) => {
      const doCliente = precoClienteVigente(precosCliente, item.produtoId, data)
      if (doCliente !== null) {
        return {
          produtoId: item.produtoId,
          qtdPacotes: item.qtdPacotes,
          precoUnit: doCliente,
          subtotal: arredondar2(doCliente * item.qtdPacotes),
          origem: 'cliente' as const,
        }
      }
      const faixa = faixaVigenteProduto(faixas, item.produtoId, total, data)
      if (!faixa) {
        const nome = nomeDoProduto(produtos, item.produtoId)
        throw new Error(`Sem faixa de preço para ${nome} com ${total} kg em ${data}`)
      }
      return {
        produtoId: item.produtoId,
        qtdPacotes: item.qtdPacotes,
        precoUnit: faixa.precoUnit,
        subtotal: arredondar2(faixa.precoUnit * item.qtdPacotes),
        origem: 'faixa' as const,
      }
    })
}

/**
 * Pacotes que fecham uma caixa de MULTIPLO_KG para um peso de pacote
 * (0,25 kg → 20; 0,5 kg → 10; 1 kg → 5). null quando o peso não divide a caixa.
 * Conta em gramas inteiros — 5/0.25 em float não é confiável.
 */
export function pacotesPorCaixa(pesoKg: number): number | null {
  const pesoG = paraGramas(pesoKg)
  if (pesoG <= 0 || MULTIPLO_G % pesoG !== 0) return null
  return MULTIPLO_G / pesoG
}

/**
 * A caixa fecha POR PRODUTO, não só no total: não existe pedir 5 pacotes de 250g
 * (1,25 kg) — o produto vai de 20 em 20. Devolve a primeira mensagem de item que
 * não fecha caixa, ou null quando o pedido está redondo.
 */
export function validarItensCaixa(itens: ItemProdutoInput[], produtos: Produto[]): string | null {
  for (const item of itens) {
    const produto = produtos.find((p) => p.id === item.produtoId)
    if (!produto || item.qtdPacotes <= 0) continue
    const kgItem = arredondar2(produto.pesoKg * item.qtdPacotes)
    if (paraGramas(kgItem) % MULTIPLO_G === 0) continue
    const caixa = pacotesPorCaixa(produto.pesoKg)
    return caixa
      ? `${item.qtdPacotes} pacote(s) de ${produto.nome} dá ${kgItem} kg — esse produto vai de ${caixa} em ${caixa} pacotes (${MULTIPLO_KG} kg por caixa).`
      : `${item.qtdPacotes} pacote(s) de ${produto.nome} dá ${kgItem} kg — ajuste para fechar múltiplo de ${MULTIPLO_KG} kg.`
  }
  return null
}

export function totalPedidoProdutos(
  itens: ItemProdutoPrecificado[],
  produtos: Produto[],
): { totalKg: number; totalValor: number } {
  return {
    totalKg: kgTotalProdutos(itens, produtos),
    totalValor: arredondar2(itens.reduce((soma, item) => soma + item.subtotal, 0)),
  }
}

/** Faixa de preço em edição na tela, por produto — ainda não tem id nem vigência confirmada. */
export interface FaixaProdutoParaValidar {
  produtoId: string
  kgMin: number
  kgMax: number | null
  precoUnit: number
}

/**
 * Equivalente a validarFaixas, por produto: mesma grade fechada de 5 em 5 kg, mesma
 * lista de erros — só troca o rótulo do SKU pelo nome do produto nas mensagens.
 */
export function validarFaixasProduto(
  faixas: FaixaProdutoParaValidar[],
  produtos: Produto[],
): string | null {
  const produtosPresentes = [...new Set(faixas.map((f) => f.produtoId))]

  for (const produtoId of produtosPresentes) {
    const nome = nomeDoProduto(produtos, produtoId)
    const doProduto = faixas.filter((f) => f.produtoId === produtoId)

    for (const f of doProduto) {
      if (!Number.isFinite(f.precoUnit) || f.precoUnit <= 0) {
        return `O preço da faixa de ${f.kgMin} kg do ${nome} está vazio ou inválido. Use vírgula ou ponto, por exemplo 10,50.`
      }
    }

    for (const f of doProduto) {
      const valores = f.kgMax === null ? [f.kgMin] : [f.kgMin, f.kgMax]
      for (const kg of valores) {
        if (paraGramas(kg) % MULTIPLO_G !== 0) {
          return `A faixa do ${nome} que começa em ${f.kgMin} kg não é múltipla de 5. Use números fechados: 5, 10, 15, 20…`
        }
      }
    }

    const ordenado = [...doProduto].sort((a, b) => a.kgMin - b.kgMin)

    if (paraGramas(ordenado[0].kgMin) !== MULTIPLO_G) {
      return `A primeira faixa do ${nome} começa em ${ordenado[0].kgMin} kg. Ela precisa começar em ${MULTIPLO_KG} kg, que é o pedido mínimo.`
    }

    for (const f of doProduto) {
      if (f.kgMax !== null && paraGramas(f.kgMax) <= paraGramas(f.kgMin)) {
        return `A faixa do ${nome} que começa em ${f.kgMin} kg termina em ${f.kgMax} kg. O teto tem que ser maior que o piso.`
      }
    }

    for (let i = 0; i < ordenado.length - 1; i++) {
      const atual = ordenado[i]
      const seguinte = ordenado[i + 1]
      if (atual.kgMax === null) continue
      const tetoG = paraGramas(atual.kgMax)
      const proximoMinG = paraGramas(seguinte.kgMin)
      if (proximoMinG <= tetoG) {
        return `As faixas do ${nome} se sobrepõem: uma vai até ${atual.kgMax} kg e a seguinte já começa em ${seguinte.kgMin} kg.`
      }
      if (proximoMinG !== tetoG + MULTIPLO_G) {
        return `A tabela do ${nome} pula de ${atual.kgMax} kg para ${seguinte.kgMin} kg. A faixa seguinte tem que começar em ${atual.kgMax + MULTIPLO_KG} kg.`
      }
    }

    const semTeto = doProduto.filter((f) => f.kgMax === null)
    if (semTeto.length === 0) {
      return `Falta a faixa sem teto do ${nome}. Deixe o campo de kg máximo vazio na última faixa, senão pedido grande fica sem preço.`
    }
    if (semTeto.length > 1) {
      return `O ${nome} tem duas faixas sem teto. Só a última pode ficar sem teto.`
    }
    if (semTeto[0] !== ordenado[ordenado.length - 1]) {
      return `Falta a faixa sem teto do ${nome}. Deixe o campo de kg máximo vazio na última faixa, senão pedido grande fica sem preço.`
    }
  }

  return null
}
