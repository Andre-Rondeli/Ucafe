import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MovConsignadoProduto } from '@/lib/consignado'
import type { Sku, TipoMovConsignado } from '@/lib/tipos'

interface LinhaMov {
  produto_id: string
  tipo: TipoMovConsignado
  qtd_pacotes: number
  data: string
  produtos: { peso_kg: number } | null
}

export function useConsignado(clienteId: string | null) {
  return useQuery({
    queryKey: ['consignado', clienteId],
    enabled: clienteId !== null,
    queryFn: async (): Promise<MovConsignadoProduto[]> => {
      const { data, error } = await supabase
        .from('consignado_movimentos')
        .select('produto_id, tipo, qtd_pacotes, data, produtos(peso_kg)')
        .eq('cliente_id', clienteId!)
        .order('data')
      if (error) throw new Error(error.message)
      return (data as unknown as LinhaMov[]).map((linha) => ({
        produtoId: linha.produto_id,
        // produto_id é NOT NULL com FK: o join só vem null se o catálogo sumir — peso 0
        // deixa a linha visível em pacotes sem inventar kg
        pesoKg: linha.produtos ? Number(linha.produtos.peso_kg) : 0,
        tipo: linha.tipo,
        qtdPacotes: linha.qtd_pacotes,
        data: linha.data,
      }))
    },
  })
}

export interface ApuracaoConsignado {
  clienteId: string
  produtoId: string
  /** SKU legado do produto, quando houver — mantém o histórico coerente com criar_pedido. */
  sku: Sku | null
  tipo: Extract<TipoMovConsignado, 'venda_apurada' | 'retorno'>
  qtdPacotes: number
  data: string
}

export function useApurarConsignado() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (apuracao: ApuracaoConsignado) => {
      const { error } = await supabase.from('consignado_movimentos').insert({
        cliente_id: apuracao.clienteId,
        produto_id: apuracao.produtoId,
        sku: apuracao.sku,
        tipo: apuracao.tipo,
        qtd_pacotes: apuracao.qtdPacotes,
        data: apuracao.data,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consignado'] }),
  })
}
