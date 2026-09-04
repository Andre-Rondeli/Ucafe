import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { arredondar2 } from '@/lib/numero'
import { KG_POR_SKU, type Canal, type CondicaoPagamento, type Sku, type StatusPedido } from '@/lib/tipos'

export interface ItemRomaneio {
  produtoId: string
  /** Nome do produto; cai no rótulo do sku legado se o produto não resolver — mesma regra de mixPorProduto. */
  nome: string
  qtdPacotes: number
  pesoUnitario: number
  pesoTotal: number
  precoUnit: number
  subtotal: number
}

export interface PedidoRomaneio {
  id: string
  data: string
  dataEntregaPrevista: string
  condicao: CondicaoPagamento
  status: StatusPedido
  totalKg: number
  totalValor: number
  observacao: string | null
  prazoRetorno: string | null
  cliente: {
    nome: string
    cidade: string | null
    whatsapp: string | null
    canal: Canal
  }
  itens: ItemRomaneio[]
}

interface LinhaPedidoRomaneio {
  id: string
  data: string
  data_entrega_prevista: string | null
  condicao_pagamento: CondicaoPagamento
  status: StatusPedido
  total_kg: number
  total_valor: number
  observacao: string | null
  prazo_retorno: string | null
  clientes: { nome: string; cidade: string | null; whatsapp: string | null; canal: Canal } | null
  pedido_itens: {
    produto_id: string
    sku: Sku | null
    qtd_pacotes: number
    preco_unit_aplicado: number
    subtotal: number
    produtos: { nome: string; peso_kg: number } | null
  }[]
}

const SELECT_ROMANEIO =
  'id, data, data_entrega_prevista, condicao_pagamento, status, total_kg, total_valor, observacao, prazo_retorno, clientes(nome, cidade, whatsapp, canal), pedido_itens(produto_id, sku, qtd_pacotes, preco_unit_aplicado, subtotal, produtos(nome, peso_kg))'

/** Um pedido com tudo que o romaneio precisa. null = não existe ou a RLS não deixa o usuário ver. */
export function usePedido(id: string | null) {
  return useQuery({
    queryKey: ['pedido', id],
    queryFn: async (): Promise<PedidoRomaneio | null> => {
      const { data, error } = await supabase
        .from('pedidos')
        .select(SELECT_ROMANEIO)
        .eq('id', id as string)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const linha = data as unknown as LinhaPedidoRomaneio | null
      if (!linha || !linha.clientes) return null

      return {
        id: linha.id,
        data: linha.data,
        dataEntregaPrevista: linha.data_entrega_prevista ?? linha.data,
        condicao: linha.condicao_pagamento,
        status: linha.status,
        totalKg: Number(linha.total_kg),
        totalValor: Number(linha.total_valor),
        observacao: linha.observacao,
        prazoRetorno: linha.prazo_retorno,
        cliente: linha.clientes,
        itens: linha.pedido_itens.map((item) => {
          const pesoUnitario = item.produtos
            ? Number(item.produtos.peso_kg)
            : item.sku
              ? KG_POR_SKU[item.sku]
              : 0
          return {
            produtoId: item.produto_id,
            nome: item.produtos?.nome ?? item.sku ?? 'Produto removido',
            qtdPacotes: item.qtd_pacotes,
            pesoUnitario,
            pesoTotal: arredondar2(pesoUnitario * item.qtd_pacotes),
            precoUnit: Number(item.preco_unit_aplicado),
            subtotal: Number(item.subtotal),
          }
        }),
      }
    },
    enabled: !!id,
  })
}
