import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Entrega {
  id: string
  clienteNome: string
  cidade: string | null
  whatsapp: string | null
  dataEntregaPrevista: string
  totalKg: number
  totalValor: number
}

interface LinhaEntrega {
  id: string
  data: string
  data_entrega_prevista: string | null
  total_kg: number
  total_valor: number
  clientes: { nome: string; cidade: string | null; whatsapp: string | null } | null
}

/** Só pedidos pendentes. Para o motorista a RLS já limita a estes; o admin precisa do filtro. */
export function useEntregas() {
  return useQuery({
    queryKey: ['entregas'],
    queryFn: async (): Promise<Entrega[]> => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('id, data, data_entrega_prevista, total_kg, total_valor, clientes(nome, cidade, whatsapp)')
        .eq('status', 'aberto')
        .order('data_entrega_prevista', { ascending: true })
      if (error) throw new Error(error.message)
      return (data as unknown as LinhaEntrega[]).map((linha) => ({
        id: linha.id,
        clienteNome: linha.clientes?.nome ?? '(cliente removido)',
        cidade: linha.clientes?.cidade ?? null,
        whatsapp: linha.clientes?.whatsapp ?? null,
        dataEntregaPrevista: linha.data_entrega_prevista ?? linha.data,
        totalKg: Number(linha.total_kg),
        totalValor: Number(linha.total_valor),
      }))
    },
    // o motorista fica com a tela aberta na rua: dado velho manda entregar o que já saiu
    staleTime: 15_000,
  })
}

/**
 * Marca a entrega como concluída. Vai por RPC porque a policy de update de `pedidos`
 * é do dono do cliente, e o motorista não é dono de nenhum — o RPC libera só a
 * transição aberto → entregue, nada mais.
 */
export function useMarcarEntregue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pedidoId: string) => {
      const { error } = await supabase.rpc('marcar_entregue', { p_pedido_id: pedidoId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entregas'] })
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
    },
  })
}
