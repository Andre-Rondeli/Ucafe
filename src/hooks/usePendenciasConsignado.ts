import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { arredondar2 } from '@/lib/numero'

export interface SaldoProdutoPendencia {
  produtoId: string
  nome: string
  pesoKg: number
  pacotes: number
}

export interface PendenciaConsignadoLinha {
  clienteId: string
  clienteNome: string
  whatsapp: string | null
  vendedorId: string
  prazoRetorno: string | null
  produtos: SaldoProdutoPendencia[]
  saldoKg: number
  ultimaApuracao: string | null
  ultimaEntrega: string | null
}

interface LinhaRpc {
  cliente_id: string
  cliente_nome: string
  whatsapp: string | null
  vendedor_id: string
  prazo_retorno: string | null
  produto_id: string
  produto_nome: string
  peso_kg: number
  saldo_pacotes: number
  ultima_apuracao: string | null
  ultima_entrega: string | null
}

/** A RPC devolve uma linha por cliente×produto; aqui agrupa de volta por cliente. */
export function usePendenciasConsignado() {
  return useQuery({
    queryKey: ['pendencias-consignado'],
    queryFn: async (): Promise<PendenciaConsignadoLinha[]> => {
      const { data, error } = await supabase.rpc('pendencias_consignado')
      if (error) throw new Error(error.message)

      const porCliente = new Map<string, PendenciaConsignadoLinha>()
      for (const linha of data as LinhaRpc[]) {
        const atual = porCliente.get(linha.cliente_id) ?? {
          clienteId: linha.cliente_id,
          clienteNome: linha.cliente_nome,
          whatsapp: linha.whatsapp,
          vendedorId: linha.vendedor_id,
          prazoRetorno: linha.prazo_retorno,
          produtos: [],
          saldoKg: 0,
          ultimaApuracao: null,
          ultimaEntrega: null,
        }
        atual.produtos.push({
          produtoId: linha.produto_id,
          nome: linha.produto_nome,
          pesoKg: Number(linha.peso_kg),
          pacotes: linha.saldo_pacotes,
        })
        atual.saldoKg = arredondar2(
          atual.saldoKg + Number(linha.peso_kg) * linha.saldo_pacotes,
        )
        if (linha.ultima_apuracao && (!atual.ultimaApuracao || linha.ultima_apuracao > atual.ultimaApuracao)) {
          atual.ultimaApuracao = linha.ultima_apuracao
        }
        if (linha.ultima_entrega && (!atual.ultimaEntrega || linha.ultima_entrega > atual.ultimaEntrega)) {
          atual.ultimaEntrega = linha.ultima_entrega
        }
        porCliente.set(linha.cliente_id, atual)
      }
      return [...porCliente.values()]
    },
  })
}
