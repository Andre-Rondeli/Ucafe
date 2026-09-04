import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth, type Papel } from '@/hooks/useAuth'
import { Carregando, Erro } from './Estado'
import { MARCA } from '@/lib/marca'

/** Onde cada papel cai ao entrar, e para onde volta se tentar rota que não é dele. */
export const ROTA_INICIAL: Record<Papel, string> = {
  admin: '/',
  vendedor: '/',
  motorista: '/entregas',
}

export function RotaProtegida({
  children,
  soAdmin = false,
  papeis,
}: {
  children: ReactNode
  soAdmin?: boolean
  /** Papéis que podem abrir a rota. Ausente = qualquer papel autenticado e ativo. */
  papeis?: Papel[]
}) {
  const { sessao, papel, ativo, carregando, erroPerfil } = useAuth()
  const exigidos = soAdmin ? (['admin'] as Papel[]) : papeis

  if (carregando) return <Carregando />
  if (!sessao) return <Navigate to="/entrar" replace />
  if (!ativo) {
    // a RLS já bloqueia tudo para conta desativada; sem esta mensagem o app ficaria
    // só com telas vazias e ninguém entenderia o motivo
    return <Erro mensagem={`Seu acesso foi desativado. Fale com o administrador do ${MARCA}.`} />
  }
  if (exigidos && papel === null) {
    // falha de rede não pode rebaixar ninguém em silêncio nem girar para sempre: diz o que
    // aconteceu. A leitura do perfil tem retry e refaz sozinha ao voltar para a aba.
    if (erroPerfil) {
      return <Erro mensagem={`Não foi possível confirmar seu acesso: ${erroPerfil}`} />
    }
    // papel ainda carregando (sessão já existe, mas o profile não voltou) -- não decide ainda
    return <Carregando />
  }
  if (exigidos && papel !== null && !exigidos.includes(papel)) {
    return <Navigate to={ROTA_INICIAL[papel]} replace />
  }
  return <>{children}</>
}
