import { diffDias } from './data.ts'

/**
 * O que ainda não virou nota fiscal — de todo mundo, não só de quem está olhando.
 *
 * A venda passa por três portas até virar dinheiro, e ela pode parar em qualquer uma:
 *
 *   pedido no app → venda no ERP (rascunho) → venda efetivada → NOTA FISCAL
 *
 * Nenhuma dessas paradas dá erro em tela nenhuma. O pedido salva, a venda existe, o
 * escritório acha que já faturou — e a venda fica meses parada sem ninguém perceber.
 * Foi o caso do Hotel Malibu: efetivada em abril, sem nota, e só apareceu quando alguém
 * foi procurar de propósito.
 *
 * Só café TORRADO entra: a nota de gado e café verde é da outra operação, e o app nem
 * confere o estado dela — misturar aqui encheria a lista de coisa que não é para ninguém
 * deste app resolver.
 */

/** Onde a venda parou. A ordem é a da fila: quanto mais cedo parou, mais longe do dinheiro. */
export type EstagioFaturamento = 'nao_subiu' | 'rascunho' | 'sem_nota'

export interface VendaParaFaturar {
  vendaId: number
  /** Quando a linha foi lida do ERP. Nulo em espelho gravado antes desta coluna existir. */
  sincronizadoEm?: string | null
  documento: string | null
  dtEmissao: string | null
  parceiroNome: string | null
  clienteId: string | null
  valorTotal: number | null
  estado: string | null
  temTorrado: boolean | null
  nfEstado: string | null
}

export interface EnvioParaFaturar {
  pedidoId: string
  vendaId: number | null
  ultimoErro: string | null
}

export interface PedidoParaFaturar {
  id: string
  clienteId: string
  clienteNome: string
  data: string
  totalValor: number
  status: string
}

export interface Pendencia {
  chave: string
  estagio: EstagioFaturamento
  clienteId: string | null
  clienteNome: string
  data: string | null
  /** Dias desde a emissão/lançamento. É a coluna que ordena: quem espera mais, primeiro. */
  diasEsperando: number | null
  valor: number | null
  vendaId: number | null
  pedidoId: string | null
  /** Só para o que veio do app — no ERP não existe "quem digitou" do lado de cá. */
  digitadoPor: string | null
  ultimoErro: string | null
}

export interface ResumoFaturamento {
  pendencias: Pendencia[]
  total: number
  valorTotal: number
  /** Dias da mais antiga. É o número que dói e que faz alguém agir. */
  maiorEspera: number | null
  /**
   * A leitura mais recente do ERP entre as vendas espelhadas.
   *
   * Vai para a tela porque esta lista é um ESPELHO, não o ERP: se a sincronia parar, o
   * número continua sendo exibido com a mesma confiança de sempre e vira mentira
   * silenciosa. Aconteceu — o espelho ficou 16 horas parado e a fila mostrava uma venda
   * já apagada no ERP e escondia uma recém-criada.
   */
  espelhoLidoEm: string | null
}

/** Venda que já virou nota (ou que morreu) não está esperando nada. */
function esperandoNota(venda: VendaParaFaturar): boolean {
  if (!venda.temTorrado) return false
  if (venda.estado === 'cancelado') return false
  const nf = venda.nfEstado
  if (nf === 'autorizada' || nf === 'emitida' || nf === 'cancelada') return false
  return true
}

export function pendenciasDeFaturamento(entrada: {
  vendas: VendaParaFaturar[]
  envios: EnvioParaFaturar[]
  pedidos: PedidoParaFaturar[]
  /** id do usuário -> nome. Vazio para quem não pode ler a equipe; o nome então some. */
  nomePorUsuario?: Record<string, string>
  criadoPorPedido?: Record<string, string | null>
  hoje: string
}): ResumoFaturamento {
  const { vendas, envios, pedidos, hoje } = entrada
  const nomes = entrada.nomePorUsuario ?? {}
  const criador = entrada.criadoPorPedido ?? {}
  const pedidoPorId = new Map(pedidos.map((pedido) => [pedido.id, pedido]))
  const dias = (data: string | null) => (data === null ? null : Math.max(0, diffDias(data, hoje)))

  const pendencias: Pendencia[] = []

  /*
   * PRIMEIRO o que nem chegou ao ERP.
   *
   * É o pior dos três e o mais invisível: o vendedor lançou, a tela disse "salvo", e a
   * venda não existe em lugar nenhum fora do app. Envio com `venda_id` já subiu — quem
   * manda no estado dele, daí em diante, é o espelho da venda.
   */
  for (const envio of envios) {
    if (envio.vendaId !== null) continue
    const pedido = pedidoPorId.get(envio.pedidoId)
    if (!pedido || pedido.status === 'cancelado') continue
    const usuario = criador[pedido.id] ?? null
    pendencias.push({
      chave: `pedido:${pedido.id}`,
      estagio: 'nao_subiu',
      clienteId: pedido.clienteId,
      clienteNome: pedido.clienteNome,
      data: pedido.data,
      diasEsperando: dias(pedido.data),
      valor: pedido.totalValor,
      vendaId: null,
      pedidoId: pedido.id,
      digitadoPor: usuario ? (nomes[usuario] ?? null) : null,
      ultimoErro: envio.ultimoErro,
    })
  }

  const doApp = new Map<number, string>()
  for (const envio of envios) {
    if (envio.vendaId !== null) doApp.set(envio.vendaId, envio.pedidoId)
  }

  for (const venda of vendas) {
    if (!esperandoNota(venda)) continue
    const pedidoId = doApp.get(venda.vendaId) ?? null
    const pedido = pedidoId ? pedidoPorId.get(pedidoId) : undefined
    const usuario = pedidoId ? (criador[pedidoId] ?? null) : null
    pendencias.push({
      chave: `venda:${venda.vendaId}`,
      estagio: venda.estado === 'rascunho' ? 'rascunho' : 'sem_nota',
      clienteId: venda.clienteId,
      // o nome do cadastro quando existe; a razão social do ERP quando a venda nasceu lá
      clienteNome: pedido?.clienteNome ?? venda.parceiroNome ?? `Venda ${venda.vendaId}`,
      data: venda.dtEmissao,
      diasEsperando: dias(venda.dtEmissao),
      valor: venda.valorTotal,
      vendaId: venda.vendaId,
      pedidoId,
      digitadoPor: usuario ? (nomes[usuario] ?? null) : null,
      ultimoErro: null,
    })
  }

  // mais antigo primeiro: é o que está há mais tempo sem virar dinheiro
  pendencias.sort(
    (a, b) =>
      (b.diasEsperando ?? -1) - (a.diasEsperando ?? -1) ||
      a.clienteNome.localeCompare(b.clienteNome),
  )

  const espelhoLidoEm = vendas.reduce<string | null>(
    (maior, venda) =>
      venda.sincronizadoEm && (maior === null || venda.sincronizadoEm > maior)
        ? venda.sincronizadoEm
        : maior,
    null,
  )

  return {
    pendencias,
    espelhoLidoEm,
    total: pendencias.length,
    valorTotal: pendencias.reduce((soma, p) => soma + (p.valor ?? 0), 0),
    maiorEspera: pendencias.reduce<number | null>(
      (maior, p) => (p.diasEsperando === null ? maior : Math.max(maior ?? 0, p.diasEsperando)),
      null,
    ),
  }
}
