import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { traduzirErro } from '@/lib/erros'
import { MARCA } from '@/lib/marca'

/** Mesmo mínimo que a Edge Function `gerenciar-usuario` exige ao criar pessoa. */
const MINIMO_SENHA = 8

/**
 * O link do e-mail de recuperação chega com `type=recovery` na hash e JÁ autentica a
 * pessoa. Duas formas de perceber isso, porque elas correm uma contra a outra:
 *
 *  - ler a hash na primeira renderização — o supabase-js a consome e limpa em seguida;
 *  - escutar `PASSWORD_RECOVERY`, que dispara depois que ele consumiu.
 *
 * Quem chegar primeiro resolve. Sem isso, a sessão de recuperação faria o `Navigate`
 * jogar a pessoa direto na home — autenticada, e sem nunca ter trocado a senha.
 */
function hashDeRecuperacao(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery'
}

type Modo = 'entrar' | 'esqueci' | 'nova-senha'

export default function Login() {
  const { sessao, entrar } = useAuth()
  const [modo, setModo] = useState<Modo>(() => (hashDeRecuperacao() ? 'nova-senha' : 'entrar'))
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') setModo('nova-senha')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // trocar a senha é o único caso em que a pessoa fica NESTA tela já com sessão
  if (sessao && modo !== 'nova-senha') return <Navigate to="/" replace />

  async function comAviso(acao: () => Promise<string>) {
    setErro(null)
    setAviso(null)
    setEnviando(true)
    try {
      setAviso(await acao())
    } catch (e) {
      setErro(traduzirErro(e instanceof Error ? e.message : 'Erro inesperado').titulo)
    } finally {
      setEnviando(false)
    }
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()

    if (modo === 'entrar') {
      void comAviso(async () => {
        await entrar(email, senha)
        return ''
      })
      return
    }

    if (modo === 'esqueci') {
      void comAviso(async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/entrar`,
        })
        if (error) throw new Error(error.message)
        // Mensagem igual com e-mail existente ou não, de propósito: dizer "essa conta não
        // existe" entrega a quem está de fora quais e-mails têm acesso ao app.
        return `Se esse e-mail tiver conta no ${MARCA}, o link de troca de senha chega em alguns minutos. Confira também o lixo eletrônico.`
      })
      return
    }

    void comAviso(async () => {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw new Error(error.message)
      setSenha('')
      setModo('entrar')
      return 'Senha trocada. Já pode entrar com ela.'
    })
  }

  const titulo =
    modo === 'entrar' ? 'Entrar' : modo === 'esqueci' ? 'Recuperar senha' : 'Nova senha'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50 p-6">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow">
        <h1>
          <span className="block text-center text-2xl font-bold tracking-tight text-amber-900">
            {MARCA}
          </span>
        </h1>

        {modo !== 'entrar' && (
          <p className="text-center text-sm font-medium text-stone-700">{titulo}</p>
        )}

        {modo === 'esqueci' && (
          <p className="text-sm text-stone-600">
            Digite o e-mail da sua conta. Mandamos um link para você criar uma senha nova.
          </p>
        )}

        {modo !== 'nova-senha' && (
          <label className="block text-sm text-stone-600">
            E-mail
            {/* `autoComplete` e `name` são o que faz o cofre de senhas e o autopreenchimento
                do iPhone aparecerem. Sem eles a equipe digita tudo à mão, toda vez. */}
            <input
              type="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com.br"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
            />
          </label>
        )}

        {modo !== 'esqueci' && (
          <label className="block text-sm text-stone-600">
            {modo === 'nova-senha' ? `Nova senha (mínimo ${MINIMO_SENHA} caracteres)` : 'Senha'}
            <input
              type="password"
              name={modo === 'nova-senha' ? 'new-password' : 'password'}
              autoComplete={modo === 'nova-senha' ? 'new-password' : 'current-password'}
              required
              minLength={modo === 'nova-senha' ? MINIMO_SENHA : undefined}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
            />
          </label>
        )}

        {erro && <p className="text-sm text-red-700">{erro}</p>}
        {aviso && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{aviso}</p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="min-h-11 w-full rounded-lg bg-amber-800 py-3 font-semibold text-white disabled:opacity-50"
        >
          {enviando
            ? 'Enviando…'
            : modo === 'entrar'
              ? 'Entrar'
              : modo === 'esqueci'
                ? 'Mandar o link'
                : 'Salvar a nova senha'}
        </button>

        <button
          type="button"
          onClick={() => {
            setModo(modo === 'entrar' ? 'esqueci' : 'entrar')
            setErro(null)
            setAviso(null)
            setSenha('')
          }}
          className="min-h-11 w-full text-sm text-stone-700 underline"
        >
          {modo === 'entrar' ? 'Esqueci minha senha' : 'Voltar para o login'}
        </button>
      </form>
    </div>
  )
}
