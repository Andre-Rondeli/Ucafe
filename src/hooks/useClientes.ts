import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Canal, CondicaoPagamento } from '@/lib/tipos'

export interface Cliente {
  id: string
  nome: string
  canal: Canal
  cidade: string | null
  whatsapp: string | null
  /*
   * Endereço de ENTREGA. Chega por três caminhos, nesta ordem de qualidade: o XML da
   * NF-e (o mais confiável, mas só existe depois da primeira nota), o cadastro do
   * AgroFácil e a consulta do CNPJ na Receita no momento do cadastro. É o que faz a
   * parada entrar na rota da carga — sem ele, a primeira entrega sai sem endereço.
   */
  endereco: string | null
  numero: string | null
  bairro: string | null
  cep: string | null
  uf: string | null
  condicaoPadrao: CondicaoPagamento
  cadenciaDeclaradaDias: number | null
  prazoConsignadoDias: number
  ativo: boolean
  vendedorId: string
  /** CNPJ/CPF só dígitos. É a chave que casa este cliente sem confundir homônimo. */
  documento: string | null
}

// o endereço é OPCIONAL na entrada: nem toda tela que salva cliente o conhece. Exigi-lo
// obrigaria essas telas a mandar algo — e o jeito mais fácil de obedecer seria mandar
// null, que apagaria o endereço já cadastrado.
export type ClienteInput = Omit<
  Cliente,
  'id' | 'vendedorId' | 'endereco' | 'numero' | 'bairro' | 'cep' | 'uf'
> & {
  id?: string
  vendedorId?: string
  endereco?: string | null
  numero?: string | null
  bairro?: string | null
  cep?: string | null
  uf?: string | null
}

interface LinhaCliente {
  id: string
  nome: string
  canal: Canal
  cidade: string | null
  whatsapp: string | null
  endereco: string | null
  numero: string | null
  bairro: string | null
  cep: string | null
  uf: string | null
  condicao_padrao: CondicaoPagamento
  cadencia_declarada_dias: number | null
  prazo_consignado_dias: number | null
  ativo: boolean
  vendedor_id: string
  documento: string | null
}

function mapear(linha: LinhaCliente): Cliente {
  return {
    id: linha.id,
    nome: linha.nome,
    canal: linha.canal,
    cidade: linha.cidade,
    whatsapp: linha.whatsapp,
    endereco: linha.endereco,
    numero: linha.numero,
    bairro: linha.bairro,
    cep: linha.cep,
    uf: linha.uf,
    condicaoPadrao: linha.condicao_padrao,
    cadenciaDeclaradaDias: linha.cadencia_declarada_dias,
    prazoConsignadoDias: linha.prazo_consignado_dias ?? 30,
    ativo: linha.ativo,
    vendedorId: linha.vendedor_id,
    documento: linha.documento,
  }
}

export function useClientes() {
  return useQuery({
    queryKey: ['clientes'],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase
        .from('clientes')
        .select(
          'id, nome, canal, cidade, whatsapp, endereco, numero, bairro, cep, uf, condicao_padrao, cadencia_declarada_dias, prazo_consignado_dias, ativo, vendedor_id, documento',
        )
        .order('nome')
      if (error) throw new Error(error.message)
      return (data as LinhaCliente[]).map(mapear)
    },
  })
}

export function useSalvarCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cliente: ClienteInput) => {
      const linha = {
        nome: cliente.nome,
        canal: cliente.canal,
        cidade: cliente.cidade,
        whatsapp: cliente.whatsapp,
        // endereço só entra quando veio preenchido: mandar null aqui apagaria o que
        // já estava cadastrado
        ...(cliente.endereco ? { endereco: cliente.endereco } : {}),
        ...(cliente.numero ? { numero: cliente.numero } : {}),
        ...(cliente.bairro ? { bairro: cliente.bairro } : {}),
        ...(cliente.cep ? { cep: cliente.cep } : {}),
        ...(cliente.uf ? { uf: cliente.uf } : {}),
        condicao_padrao: cliente.condicaoPadrao,
        cadencia_declarada_dias: cliente.cadenciaDeclaradaDias,
        prazo_consignado_dias: cliente.prazoConsignadoDias,
        ativo: cliente.ativo,
        documento: cliente.documento,
        ...(cliente.vendedorId ? { vendedor_id: cliente.vendedorId } : {}),
      }
      const resposta = cliente.id
        ? await supabase.from('clientes').update(linha).eq('id', cliente.id).select('id').single()
        : await supabase.from('clientes').insert(linha).select('id').single()
      if (resposta.error) throw new Error(resposta.error.message)
      return { id: String((resposta.data as { id: string }).id) }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientes'] }),
  })
}
