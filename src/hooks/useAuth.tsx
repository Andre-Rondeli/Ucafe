import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type Papel = 'admin' | 'vendedor' | 'motorista'

interface Auth {
  sessao: Session | null
  usuarioId: string | null
  papel: Papel | null
  nome: string | null
  /** false quando o admin desativou esta conta — a tela avisa em vez de mostrar listas vazias. */
  ativo: boolean
  carregando: boolean
  /** Mensagem quando o perfil (papel/nome) não pôde ser lido — a tela mostra isso em vez de girar para sempre. */
  erroPerfil: string | null
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => Promise<void>
}

const Contexto = createContext<Auth | null>(null)

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // via useQuery de propósito: uma falha de rede aqui rebaixava o admin em silêncio e
  // deixava as telas de admin girando para sempre, sem retry e sem mensagem. Aqui tem
  // retry e refetch ao voltar para a aba.
  const { data: perfil, error: erroPerfilQuery } = useQuery({
    queryKey: ['perfil', sessao?.user.id],
    enabled: !!sessao,
    queryFn: async (): Promise<{ papel: Papel; nome: string | null; ativo: boolean }> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('papel, nome, ativo')
        .eq('id', sessao!.user.id)
        .single()
      if (error) throw new Error(error.message)
      return {
        papel: (data?.papel as Papel) ?? 'vendedor',
        nome: data?.nome ?? null,
        // só bloqueia com `false` explícito: perfil não lido ainda não é conta desativada
        ativo: data?.ativo !== false,
      }
    },
  })

  const valor: Auth = {
    sessao,
    usuarioId: sessao?.user.id ?? null,
    papel: sessao ? (perfil?.papel ?? null) : null,
    nome: sessao ? (perfil?.nome ?? null) : null,
    ativo: perfil?.ativo !== false,
    // só a sessão: a primeira tela não espera o perfil (o papel chega em seguida)
    carregando,
    erroPerfil: sessao && erroPerfilQuery ? erroPerfilQuery.message : null,
    entrar: async (email, senha) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) throw new Error('E-mail ou senha inválidos')
    },
    sair: async () => {
      await supabase.auth.signOut()
      // sem isto, o próximo login no mesmo aparelho enxerga por um instante o cache do
      // usuário anterior (as query keys de cliente/pedido não têm o id do usuário)
      queryClient.clear()
    },
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAuth(): Auth {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAuth precisa estar dentro de ProvedorAuth')
  return contexto
}
