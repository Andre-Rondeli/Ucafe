import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { addDias, hojeIso } from '@/lib/data'
import { invocarFuncao } from '@/lib/funcoes'
import type { ItemProdutoPrecificado } from '@/lib/preco'
import type {
  Canal,
  CondicaoPagamento,
  ItemPrecificado,
  Sku,
  StatusPedido,
} from '@/lib/tipos'

export interface PedidoCompleto {
  id: string
  clienteId: string
  clienteNome: string
  canal: Canal
  data: string
  dataEntregaPrevista: string
  condicao: CondicaoPagamento
  status: StatusPedido
  totalKg: number
  totalValor: number
  itens: ItemPrecificado[]
  /**
   * Quem DIGITOU o pedido — não o dono do cliente.
   *
   * É o que responde "quem lançou isto?" na fila de faturamento, e o que prova que a
   * lista é da equipe inteira e não só de quem está com o celular na mão.
   */
  criadoPor: string | null
}

interface LinhaPedido {
  id: string
  cliente_id: string
  data: string
  data_entrega_prevista: string | null
  condicao_pagamento: CondicaoPagamento
  status: StatusPedido
  total_kg: number
  total_valor: number
  created_by: string | null
  clientes: { nome: string; canal: Canal } | null
  pedido_itens: {
    produto_id: string
    sku: Sku | null
    qtd_pacotes: number
    preco_unit_aplicado: number
    subtotal: number
    pedido_item_custos: unknown
  }[]
}

const SELECT_PEDIDO =
  'id, cliente_id, data, data_entrega_prevista, condicao_pagamento, status, total_kg, total_valor, created_by, clientes(nome, canal), pedido_itens(produto_id, sku, qtd_pacotes, preco_unit_aplicado, subtotal, pedido_item_custos(custo_unit_aplicado))'

/**
 * Custo congelado do item. Vem vazio para quem não é admin (a RLS de
 * `pedido_item_custos` só deixa admin ler) — isso não é erro, é a proteção funcionando.
 *
 * O PostgREST devolve OBJETO quando a FK também é PK (1-para-1) e ARRAY em outras
 * versões. Ler as duas formas em vez de assumir uma: assumir forma de resposta já
 * mascarou causa real de bug neste app antes.
 */
function custoDoItem(bruto: unknown): number | null {
  const linha = Array.isArray(bruto) ? bruto[0] : bruto
  const valor = (linha as { custo_unit_aplicado?: number } | null | undefined)?.custo_unit_aplicado
  return valor === undefined || valor === null ? null : Number(valor)
}

/**
 * Janela padrão: 2 anos. É a única consulta que carrega pedido + itens + custo, e ela roda
 * em quase toda navegação (Hoje, Painel, Clientes, Ficha do Cliente). Sem janela ela
 * crescia para sempre — com um ano de operação, megabytes no 3G do vendedor a cada tela.
 *
 * 2 anos e não 3 meses porque não é só "o que vendi hoje" que sai daqui: a fila de
 * recompra mede a cadência de cada cliente, e a Ficha mostra o histórico dele. Cortar
 * curto não deixaria a tela lenta — deixaria ERRADA, dizendo que um cliente antigo nunca
 * comprou. 2 anos cobre isso com folga e ainda assim é um teto que anda junto com o tempo.
 *
 * Quem precisa de mais fundo passa `desde` — é o que a tela de Relatório faz quando a
 * pessoa escolhe um período anterior a essa janela.
 */
const JANELA_PADRAO_DIAS = 730

export function usePedidos(desde?: string) {
  const inicio = desde ?? addDias(hojeIso(), -JANELA_PADRAO_DIAS)
  return useQuery({
    // `desde` entra na chave: sem isso o Relatório de um período antigo leria o cache da
    // janela curta e mostraria menos pedido do que existe, sem avisar ninguém.
    queryKey: ['pedidos', inicio],
    queryFn: async (): Promise<PedidoCompleto[]> => {
      const { data, error } = await supabase
        .from('pedidos')
        .select(SELECT_PEDIDO)
        .gte('data', inicio)
        .order('data', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as unknown as LinhaPedido[]).map((linha) => ({
        id: linha.id,
        clienteId: linha.cliente_id,
        clienteNome: linha.clientes?.nome ?? '(cliente removido)',
        canal: linha.clientes?.canal ?? 'consumidor',
        data: linha.data,
        dataEntregaPrevista: linha.data_entrega_prevista ?? linha.data,
        condicao: linha.condicao_pagamento,
        status: linha.status,
        totalKg: Number(linha.total_kg),
        totalValor: Number(linha.total_valor),
        criadoPor: linha.created_by,
        itens: linha.pedido_itens.map((item) => ({
          produtoId: item.produto_id,
          sku: item.sku,
          qtdPacotes: item.qtd_pacotes,
          precoUnit: Number(item.preco_unit_aplicado),
          subtotal: Number(item.subtotal),
          custoUnit: custoDoItem(item.pedido_item_custos),
        })),
      }))
    },
  })
}

export interface NovoPedido {
  clienteId: string
  data: string
  condicao: CondicaoPagamento
  status: StatusPedido
  observacao: string | null
  totalKg: number
  totalValor: number
  itens: ItemProdutoPrecificado[]
  /** Só faz sentido em consignado; para as demais condições vai null. */
  prazoRetorno: string | null
  dataEntregaPrevista: string
}

export function useCriarPedido() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pedido: NovoPedido): Promise<string> => {
      const { data, error } = await supabase.rpc('criar_pedido', {
        p_cliente_id: pedido.clienteId,
        p_data: pedido.data,
        p_condicao: pedido.condicao,
        p_status: pedido.status,
        p_observacao: pedido.observacao,
        p_total_kg: pedido.totalKg,
        p_total_valor: pedido.totalValor,
        p_itens: pedido.itens.map((item) => ({
          produto_id: item.produtoId,
          qtd_pacotes: item.qtdPacotes,
          preco_unit_aplicado: item.precoUnit,
          subtotal: item.subtotal,
        })),
        p_prazo_retorno: pedido.prazoRetorno,
        p_data_entrega_prevista: pedido.dataEntregaPrevista,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.invalidateQueries({ queryKey: ['consignado'] })
    },
  })
}

/**
 * Cancela um pedido lançado errado — **não apaga, só marca como cancelado**.
 *
 * Apagar levaria junto os itens, o custo congelado e o movimento de consignado; e a venda
 * some do histórico sem deixar rastro de que existiu. `cancelado` é o único status que as
 * métricas, o painel e a comissão excluem, então o número fica certo e o registro fica.
 *
 * Quem decide se PODE cancelar é o banco: a RLS diz de quem é o pedido e o trigger de
 * imutabilidade recusa qualquer outra alteração. Regra de dinheiro na tela é sugestão;
 * no banco é barreira.
 */
export function useCancelarPedido() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pedidos')
        .update({ status: 'cancelado' })
        .eq('id', id)
      if (error) throw new Error(error.message)
      return { ok: true as const }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.invalidateQueries({ queryKey: ['consignado'] })
    },
  })
}