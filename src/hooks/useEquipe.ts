import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type PapelUsuario = 'admin' | 'vendedor' | 'motorista'

export interface MembroEquipe {
  id: string
  nome: string
  email: string
  papel: PapelUsuario
  ativo: boolean
  clientesAtivos: number
  criadoEm: string
}

interface LinhaEquipe {
  id: string
  nome: string
  email: string
  papel: PapelUsuario
  ativo: boolean
  clientes_ativos: number
  criado_em: string
}

export function useEquipe(opcoes?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['equipe'],
    enabled: opcoes?.enabled,
    queryFn: async (): Promise<MembroEquipe[]> => {
      const { data, error } = await supabase.rpc('listar_equipe')
      if (error) throw new Error(error.message)

      return (data as LinhaEquipe[]).map((l) => ({
        id: l.id,
        nome: l.nome,
        email: l.email,
        papel: l.papel,
        ativo: l.ativo,
        clientesAtivos: l.clientes_ativos,
        criadoEm: l.criado_em,
      }))
    },
  })
}

async function chamarGerenciarUsuario(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('gerenciar-usuario', { body })
  if (error) {
    // Em erro HTTP (não-2xx), `context` é a Response e traz a mensagem em PT-BR.
    // Em erro de rede/CORS, `context` NÃO é Response — chamar .json() nele estoura
    // e esconde a causa real. Por isso a checagem de tipo antes.
    const contexto = (error as { context?: unknown }).context
    let corpo: { erro?: string } | null = null
    if (contexto instanceof Response) {
      corpo = await contexto.json().catch(() => null)
    }
    throw new Error(corpo?.erro ?? error.message ?? 'Não foi possível falar com o servidor.')
  }
  if (data?.erro) throw new Error(data.erro)
  return data
}

export function useCriarMembro() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; nome: string; papel: PapelUsuario; senha: string }) =>
      chamarGerenciarUsuario({ acao: 'criar', ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipe'] }),
  })
}

export function useAtualizarMembro() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id: string
      nome?: string
      papel?: PapelUsuario
      ativo?: boolean
      senha?: string
    }) => chamarGerenciarUsuario({ acao: 'atualizar', ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipe'] })
      // desativar/reativar vendedor muda quais clientes aparecem pra ele e pro admin
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
    },
  })
}
