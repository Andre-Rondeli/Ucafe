import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Custo atual por produto (produtoId → custo por pacote).
 *
 * Tabela separada de `produtos` e só de admin: RLS do Postgres protege LINHA, não
 * coluna — custo dentro de `produtos` vazaria para vendedor e motorista, que leem o
 * catálogo. Para quem não é admin esta consulta volta vazia (não é erro).
 */
export function useProdutoCustos() {
  return useQuery({
    queryKey: ['produto-custos'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from('produto_custos').select('produto_id, custo_unit')
      if (error) throw new Error(error.message)
      return Object.fromEntries(
        (data as { produto_id: string; custo_unit: number }[]).map((l) => [
          l.produto_id,
          Number(l.custo_unit),
        ]),
      )
    },
    staleTime: 5 * 60_000,
  })
}

export function useSalvarProdutoCusto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ produtoId, custoUnit }: { produtoId: string; custoUnit: number }) => {
      const { error } = await supabase
        .from('produto_custos')
        .upsert(
          { produto_id: produtoId, custo_unit: custoUnit, atualizado_em: new Date().toISOString() },
          { onConflict: 'produto_id' },
        )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['produto-custos'] }),
  })
}
