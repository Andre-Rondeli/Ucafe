import { addDias, diffDias } from './data.ts'
import { arredondar2 } from './numero.ts'
import { faixaVigente, faixaVigenteProduto, proximaFaixa, proximaFaixaProduto, type FaixaProduto } from './preco.ts'
import type { FaixaPreco, Sku } from './tipos.ts'

export interface PedidoHistorico {
  data: string
  totalKg: number
}

export type Confianca = 'sem_historico' | 'baixa' | 'media' | 'alta'
export type OrigemCadencia = 'calculada' | 'declarada' | 'nenhuma'

export interface PrevisaoRecompra {
  cadenciaDias: number | null
  origemCadencia: OrigemCadencia
  proximaCompraPrevista: string | null
  /** Positivo = a previsão já passou. É a chave de ordenação da lista de recompra. */
  atrasoDias: number | null
  qtdSugeridaKg: number | null
  confianca: Confianca
}

const PEDIDOS_PARA_CADENCIA = 5
const PEDIDOS_PARA_QUANTIDADE = 3
const DIAS_DE_ANTECEDENCIA = 3
const FATOR_RISCO = 1.5
const PISO_QUEDA = 0.7
/** Janela de comparação do sinal `caindo` — separada da janela de cadência de propósito. */
const PEDIDOS_PARA_QUEDA = 5

/**
 * Uma compra é um DIA, não um documento.
 *
 * O cliente que leva 100 kg em duas notas no mesmo dia fez UMA compra de 100 kg, não duas
 * de 50. Contar por documento estragava as duas contas de uma vez: a sugestão de
 * quantidade caía pela metade (a média divide por 3 documentos em vez de 3 dias) e a
 * janela da cadência encolhia, porque as duplicatas comiam as vagas do histórico.
 *
 * Ficou visível quando as notas do ERP entraram na ficha: lá o mesmo cliente tem duas e
 * três notas no mesmo dia com naturalidade — é uma por pedido do escritório, não por
 * compra do cliente.
 */
function porDia(pedidos: PedidoHistorico[]): PedidoHistorico[] {
  const soma = new Map<string, number>()
  for (const pedido of pedidos) {
    soma.set(pedido.data, arredondar2((soma.get(pedido.data) ?? 0) + pedido.totalKg))
  }
  return [...soma.entries()]
    .map(([data, totalKg]) => ({ data, totalKg }))
    .sort((a, b) => a.data.localeCompare(b.data))
}

function ordenados(pedidos: PedidoHistorico[]): PedidoHistorico[] {
  return porDia(pedidos)
}

function confiancaDe(quantidade: number): Confianca {
  if (quantidade < 2) return 'sem_historico'
  if (quantidade < 3) return 'baixa'
  if (quantidade <= 5) return 'media'
  return 'alta'
}

function mediaKg(pedidos: PedidoHistorico[]): number {
  return arredondar2(pedidos.reduce((soma, p) => soma + p.totalKg, 0) / pedidos.length)
}

/**
 * Previsão de recompra por média móvel simples.
 * Sem sazonalidade e sem modelo — se o histórico revelar padrão mensal, troca-se aqui.
 */
export function prever(
  pedidos: PedidoHistorico[],
  cadenciaDeclaradaDias: number | null,
  hoje: string,
): PrevisaoRecompra {
  const lista = ordenados(pedidos)
  const confianca = confiancaDe(lista.length)

  if (lista.length === 0) {
    return {
      cadenciaDias: cadenciaDeclaradaDias,
      origemCadencia: cadenciaDeclaradaDias === null ? 'nenhuma' : 'declarada',
      proximaCompraPrevista: null,
      atrasoDias: null,
      qtdSugeridaKg: null,
      confianca,
    }
  }

  const ultimo = lista[lista.length - 1]
  const qtdSugeridaKg = mediaKg(lista.slice(-PEDIDOS_PARA_QUANTIDADE))

  let cadenciaDias: number | null = null
  let origemCadencia: OrigemCadencia = 'nenhuma'

  if (lista.length >= 2) {
    const recentes = lista.slice(-PEDIDOS_PARA_CADENCIA)
    const intervalos = recentes
      .slice(1)
      .map((pedido, indice) => diffDias(recentes[indice].data, pedido.data))
      // rede: `porDia` já junta o mesmo dia, então intervalo 0 não deveria existir. Se
      // aparecer (data repetida vinda de outro caminho), não pode travar o cliente em
      // cadência 0
      .filter((d) => d > 0)
    if (intervalos.length > 0) {
      cadenciaDias = Math.round(intervalos.reduce((soma, d) => soma + d, 0) / intervalos.length)
      origemCadencia = 'calculada'
    } else if (cadenciaDeclaradaDias !== null) {
      cadenciaDias = cadenciaDeclaradaDias
      origemCadencia = 'declarada'
    }
  } else if (cadenciaDeclaradaDias !== null) {
    cadenciaDias = cadenciaDeclaradaDias
    origemCadencia = 'declarada'
  }

  const proximaCompraPrevista = cadenciaDias === null ? null : addDias(ultimo.data, cadenciaDias)

  return {
    cadenciaDias,
    origemCadencia,
    proximaCompraPrevista,
    atrasoDias: proximaCompraPrevista === null ? null : diffDias(proximaCompraPrevista, hoje),
    qtdSugeridaKg,
    confianca,
  }
}

export type Sinal = 'novo' | 'na_hora' | 'em_risco' | 'caindo' | 'ok'

/** Sinais que a tela usa para priorizar a ligação do vendedor. */
export type Semaforo = 'verde' | 'amarelo' | 'vermelho' | 'sem_dado'

export interface JanelaDeVenda {
  cor: Semaforo
  /**
   * Onde o cliente está no ciclo dele, em %. 0 = a compra vence hoje. +50 = passou meio
   * ciclo do ponto. -100 = comprou agora.
   */
  percentual: number | null
  /** Texto curto para a lista: "vencido há 12 dias", "em 4 dias", "hoje". */
  rotulo: string
}

/** A partir daqui o cliente está fora do padrão dele o bastante para ser abordado. */
const VERDE_A_PARTIR_DE = 50
/** Abaixo disso ele comprou há pouco: ligar agora é atrapalhar. */
const VERMELHO_ABAIXO_DE = -10

/**
 * Semáforo de recompra: dá para vender hoje?
 *
 * A régua é o ciclo DO CLIENTE, não uma quantidade fixa de dias — quem compra a cada 7
 * dias e está 5 atrasado é caso urgente; quem compra a cada 60 e está 5 atrasado não é
 * nada. Por isso o percentual, e não o número de dias.
 *
 *   🟢 **verde** — passou 50% do ciclo além do ponto de recompra. Ele já devia ter
 *      repetido o pedido: é aqui que a ligação vira venda.
 *   🟡 **amarelo** — de -10% a +49,99%. Está na janela, ainda dentro do padrão dele.
 *   🔴 **vermelho** — abaixo de -10%. Comprou há pouco; ainda tem café na prateleira.
 *
 * Sem cadência conhecida não há régua, e cinza é resposta honesta: o cliente não tem
 * histórico suficiente (ou nunca comprou).
 */
export function janelaDeVenda(previsao: PrevisaoRecompra): JanelaDeVenda {
  if (previsao.cadenciaDias === null || previsao.cadenciaDias <= 0 || previsao.atrasoDias === null) {
    return { cor: 'sem_dado', percentual: null, rotulo: 'sem histórico' }
  }

  const percentual = arredondar2((previsao.atrasoDias / previsao.cadenciaDias) * 100)
  const cor: Semaforo =
    percentual >= VERDE_A_PARTIR_DE
      ? 'verde'
      : percentual >= VERMELHO_ABAIXO_DE
        ? 'amarelo'
        : 'vermelho'

  const dias = previsao.atrasoDias
  const rotulo =
    dias === 0
      ? 'vence hoje'
      : dias > 0
        ? `vencido há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
        : `em ${-dias} ${dias === -1 ? 'dia' : 'dias'}`

  return { cor, percentual, rotulo }
}

export function sinais(
  pedidos: PedidoHistorico[],
  previsao: PrevisaoRecompra,
  hoje: string,
): Sinal[] {
  const lista = ordenados(pedidos)
  const encontrados: Sinal[] = []

  // `novo` é rótulo de confiança, não curto-circuito: um cliente com cadência
  // declarada tem previsão válida e precisa acender na fila mesmo sem histórico.
  if (previsao.confianca === 'sem_historico') encontrados.push('novo')
  if (lista.length === 0) return encontrados

  const ultimo = lista[lista.length - 1]

  if (previsao.atrasoDias !== null && previsao.atrasoDias >= -DIAS_DE_ANTECEDENCIA) {
    encontrados.push('na_hora')
  }

  if (
    previsao.cadenciaDias !== null &&
    diffDias(ultimo.data, hoje) > previsao.cadenciaDias * FATOR_RISCO
  ) {
    encontrados.push('em_risco')
  }

  // compara com a média dos ANTERIORES: incluir o último na média mascararia a queda
  const anteriores = lista.slice(0, -1).slice(-PEDIDOS_PARA_QUEDA)
  if (anteriores.length > 0 && ultimo.totalKg < mediaKg(anteriores) * PISO_QUEDA) {
    encontrados.push('caindo')
  }

  return encontrados.length > 0 ? encontrados : ['ok']
}

export interface OportunidadeFaixa {
  kgFaltando: number
  precoAtual: number
  precoMelhor: number
  economiaPorPacote: number
}

/** Argumento de venda: quanto falta em kg para o cliente cair na faixa melhor. */
export function oportunidadeFaixa(
  faixas: FaixaPreco[],
  sku: Sku,
  kgTipico: number,
  data: string,
): OportunidadeFaixa | null {
  const atual = faixaVigente(faixas, sku, kgTipico, data)
  const melhor = proximaFaixa(faixas, sku, kgTipico, data)
  if (!atual || !melhor || melhor.precoUnit >= atual.precoUnit) return null
  return {
    kgFaltando: arredondar2(melhor.kgMin - kgTipico),
    precoAtual: atual.precoUnit,
    precoMelhor: melhor.precoUnit,
    economiaPorPacote: arredondar2(atual.precoUnit - melhor.precoUnit),
  }
}

/** Equivalente a oportunidadeFaixa, por produto — mesmo argumento de venda, agora por produto_id. */
export function oportunidadeFaixaProduto(
  faixas: FaixaProduto[],
  produtoId: string,
  kgTipico: number,
  data: string,
): OportunidadeFaixa | null {
  const atual = faixaVigenteProduto(faixas, produtoId, kgTipico, data)
  const melhor = proximaFaixaProduto(faixas, produtoId, kgTipico, data)
  if (!atual || !melhor || melhor.precoUnit >= atual.precoUnit) return null
  return {
    kgFaltando: arredondar2(melhor.kgMin - kgTipico),
    precoAtual: atual.precoUnit,
    precoMelhor: melhor.precoUnit,
    economiaPorPacote: arredondar2(atual.precoUnit - melhor.precoUnit),
  }
}

export interface EstoqueNoCliente {
  /** Nunca negativo: prateleira vazia é zero, não dívida. O atraso vira `acabouHaDias`. */
  kgEstimado: number
  consumoKgDia: number
  /** Dias que o estimado ainda cobre a partir de hoje. Zero quando já acabou. */
  diasDeCobertura: number
  /** Preenchido só quando a conta zerou antes de hoje — é o argumento da ligação. */
  acabouHaDias: number | null
  confianca: Confianca
}

/**
 * Estoque estimado NO CLIENTE: o que sobrou da última compra dele.
 *
 * Não é inventário — é conta de padeiro, e é o melhor que dá sem colocar o pé na cozinha
 * do cliente: ele consome uma compra por ciclo, então gasta `média das últimas compras ÷
 * cadência` por dia. Do que levou na última compra, tira o que já consumiu desde então.
 *
 * A média entra no lugar da última compra no consumo de propósito: uma compra fora do
 * padrão (o cliente que dobrou porque ia viajar) mudaria a velocidade de consumo dele, e
 * não muda — muda só o quanto ele tem na prateleira.
 *
 * Devolve `null` quando não há régua: sem cadência conhecida não existe velocidade de
 * consumo, e chutar aqui seria pior que não responder.
 */
export function estoqueNoCliente(
  pedidos: PedidoHistorico[],
  cadenciaDeclaradaDias: number | null,
  hoje: string,
): EstoqueNoCliente | null {
  const lista = ordenados(pedidos)
  if (lista.length === 0) return null

  const previsao = prever(pedidos, cadenciaDeclaradaDias, hoje)
  if (previsao.cadenciaDias === null || previsao.cadenciaDias <= 0) return null

  const ultimo = lista[lista.length - 1]
  const consumoKgDia = arredondar2((previsao.qtdSugeridaKg ?? ultimo.totalKg) / previsao.cadenciaDias)
  if (consumoKgDia <= 0) return null

  // compra com data futura (digitação errada) não pode virar consumo negativo
  const diasCorridos = Math.max(0, diffDias(ultimo.data, hoje))
  const saldo = ultimo.totalKg - consumoKgDia * diasCorridos

  return {
    kgEstimado: arredondar2(Math.max(0, saldo)),
    consumoKgDia,
    diasDeCobertura: saldo > 0 ? Math.ceil(saldo / consumoKgDia) : 0,
    acabouHaDias: saldo > 0 ? null : Math.floor(-saldo / consumoKgDia),
    confianca: previsao.confianca,
  }
}
