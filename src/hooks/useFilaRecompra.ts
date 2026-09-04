import { useMemo } from 'react'
import { useClientes } from '@/hooks/useClientes'
import { usePedidos } from '@/hooks/usePedidos'
import { hojeIso } from '@/lib/data'
import { montarFila, type Fila } from '@/lib/fila-recompra'
import { porCliente } from '@/lib/insights'
import { apenasValidos } from '@/lib/metricas-venda'

export interface RetornoFilaRecompra {
  fila: Fila
  /** Quantos já passaram da data — é o número que o aviso das 9h manda no celular. */
  vencidos: number
  isLoading: boolean
  error: Error | null
}

/**
 * A fila de recompra, em UM lugar só.
 *
 * Existe para o número não divergir: "6 clientes na hora de recomprar" no aviso, no cartão
 * do Hoje e no relatório precisa ser a mesma conta. Quando cada tela montava a sua,
 * conferir qual estava certa custava a manhã.
 *
 * A mesma régua roda no servidor, na Edge Function `recompra`: ela lê os mesmos pedidos e
 * chama o mesmo `prever` de `src/lib/recompra.ts` — uma régua, não duas.
 */
export function useFilaRecompra(): RetornoFilaRecompra {
  const { data: pedidos, isLoading, error } = usePedidos()
  const { data: clientes, isLoading: carregandoClientes, error: erroClientes } = useClientes()

  const fila = useMemo(() => {
    const cadencias = Object.fromEntries(
      (clientes ?? []).map((cliente) => [cliente.id, cliente.cadenciaDeclaradaDias]),
    )
    const linhas = porCliente(apenasValidos(pedidos ?? []), cadencias, hojeIso())
    return montarFila(linhas, clientes ?? [])
  }, [pedidos, clientes])

  return {
    fila,
    vencidos: fila.vencidos.length,
    isLoading: isLoading || carregandoClientes,
    error: (error as Error | null) ?? (erroClientes as Error | null) ?? null,
  }
}
