import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BaseComissionavel, RegraComissao } from '@/lib/comissao'

interface LinhaRegra {
  percentual: number
  vigente_desde: string
}

export function useRegrasComissao(vendedorId: string | null) {
  return useQuery({
    queryKey: ['comissao-regras', vendedorId],
    enabled: vendedorId !== null,
    queryFn: async (): Promise<RegraComissao[]> => {
      const { data, error } = await supabase
        .from('comissao_regra')
        .select('percentual, vigente_desde')
        .eq('vendedor_id', vendedorId!)
        .order('vigente_desde', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as LinhaRegra[]).map((linha) => ({
        percentual: Number(linha.percentual),
        vigenteDesde: linha.vigente_desde,
      }))
    },
  })
}

export function useSalvarRegraComissao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { vendedorId: string; percentual: number; vigenteDesde: string }) => {
      const { error } = await supabase.from('comissao_regra').upsert(
        {
          vendedor_id: input.vendedorId,
          percentual: input.percentual,
          vigente_desde: input.vigenteDesde,
        },
        { onConflict: 'vendedor_id,vigente_desde' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comissao-regras'] }),
  })
}

interface LinhaBase {
  data: string
  valor: number
  origem: 'pedido' | 'consignado'
  descricao: string
}

export function useBasesComissao(vendedorId: string | null, inicio: string, fim: string) {
  return useQuery({
    queryKey: ['comissao-bases', vendedorId, inicio, fim],
    enabled: vendedorId !== null,
    queryFn: async (): Promise<(BaseComissionavel & { descricao: string })[]> => {
      const { data, error } = await supabase.rpc('bases_comissao', {
        p_vendedor_id: vendedorId,
        p_inicio: inicio,
        p_fim: fim,
      })
      if (error) throw new Error(error.message)
      return (data as LinhaBase[]).map((linha) => ({
        data: linha.data,
        valor: Number(linha.valor),
        origem: linha.origem,
        descricao: linha.descricao,
      }))
    },
  })
}
