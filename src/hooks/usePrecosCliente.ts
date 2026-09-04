import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { hojeIso } from '@/lib/data'
import type { PrecoDeCliente } from '@/lib/preco'

/**
 * Preço combinado com um cliente, por produto.
 *
 * Vence a faixa de kg: existindo preço aqui, o volume do pedido deixa de mudar o valor do
 * pacote. Reajuste é REGISTRO NOVO (`vigente_desde`), nunca edição — editar faria o
 * histórico mudar sozinho. Pedido já lançado tem o preço congelado e não é afetado.
 *
 * Lê quem enxerga o cliente (o vendedor precisa, para o pedido sair certo); escreve só
 * admin. Quem garante isso é a RLS, não a tela.
 */

export interface PrecoClienteLinha extends PrecoDeCliente {
  id: string
}

export function usePrecosCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ['precos-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<PrecoClienteLinha[]> => {
      const { data, error } = await supabase
        .from('precos_cliente')
        .select('id, produto_id, preco_unit, vigente_desde')
        .eq('cliente_id', clienteId!)
        .order('vigente_desde', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as { id: string; produto_id: string; preco_unit: number; vigente_desde: string }[]).map(
        (linha) => ({
          id: linha.id,
          produtoId: linha.produto_id,
          precoUnit: Number(linha.preco_unit),
          vigenteDesde: linha.vigente_desde,
        }),
      )
    },
    // preço combinado muda raramente, e o pedido precisa dele em mãos
    staleTime: 5 * 60_000,
  })
}

export function useSalvarPrecoCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: { clienteId: string; produtoId: string; precoUnit: number }) => {
      if (!Number.isFinite(entrada.precoUnit) || entrada.precoUnit < 0) {
        throw new Error('Informe um preço válido, zero ou maior.')
      }
      // conflito na mesma data = reajuste no mesmo dia: substitui, em vez de recusar
      const { error } = await supabase.from('precos_cliente').upsert(
        {
          cliente_id: entrada.clienteId,
          produto_id: entrada.produtoId,
          preco_unit: entrada.precoUnit,
          vigente_desde: hojeIso(),
        },
        { onConflict: 'cliente_id,produto_id,vigente_desde' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['precos-cliente'] }),
  })
}

/** Tira o preço combinado: o cliente volta para a tabela de faixas. */
export function useRemoverPrecoCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('precos_cliente').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['precos-cliente'] }),
  })
}
