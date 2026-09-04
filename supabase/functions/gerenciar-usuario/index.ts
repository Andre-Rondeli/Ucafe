// Edge Function: admin cria e edita usuários (profiles + auth.users).
// Roda no servidor porque precisa da service_role — essa chave nunca pode
// existir no bundle do navegador (ignora RLS).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js manda x-client-info e apikey em toda chamada: sem eles na lista,
  // o preflight falha e o navegador nem chega a invocar a função.
  // Esta é a lista canônica do próprio SDK (SUPABASE_HEADERS em
  // @supabase/supabase-js/cors) + x-region, que o functions-js manda quando há região
  // fixada. x-retry-count/x-region não são usados por functions.invoke hoje, mas liberar
  // agora custa nada e evita repetir o bug de preflight que derrubou o cadastro de pessoa.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAPEIS = ['admin', 'vendedor', 'motorista']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // --- autorização, sempre antes de tocar no corpo ---
  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ erro: 'Não autenticado' }, 401)

  const clienteAnon = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErro } = await clienteAnon.auth.getUser()
  if (userErro || !userData.user) return json({ erro: 'Sessão inválida' }, 401)
  const chamadorId = userData.user.id

  const admin = createClient(url, serviceKey)

  const { data: perfilChamador } = await admin
    .from('profiles')
    .select('papel, ativo')
    .eq('id', chamadorId)
    .single()

  if (!perfilChamador || perfilChamador.papel !== 'admin' || !perfilChamador.ativo) {
    return json({ erro: 'Só administradores podem gerenciar a equipe.' }, 403)
  }

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Corpo inválido' }, 400)
  }

  if (corpo.acao === 'criar') {
    const { email, nome, papel, senha } = corpo as {
      email?: string
      nome?: string
      papel?: string
      senha?: string
    }
    if (!email || !EMAIL_RE.test(email)) return json({ erro: 'E-mail inválido' }, 400)
    if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400)
    if (!papel || !PAPEIS.includes(papel)) return json({ erro: 'Papel inválido' }, 400)
    if (!senha || senha.length < 8) return json({ erro: 'Senha precisa de no mínimo 8 caracteres' }, 400)

    const { data: criado, error: criarErro } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })

    if (criarErro) {
      const jaExiste = /already been registered|already exists/i.test(criarErro.message)
      return json(
        { erro: jaExiste ? 'Já existe uma conta com esse e-mail.' : 'Não foi possível criar o usuário.' },
        jaExiste ? 409 : 400,
      )
    }

    // o trigger handle_new_user já criou o profile com nome do metadata e papel padrão vendedor
    const { error: updErro } = await admin
      .from('profiles')
      .update({ nome, papel })
      .eq('id', criado.user.id)
    if (updErro) return json({ erro: 'Usuário criado, mas houve falha ao definir o papel.' }, 500)

    return json({ ok: true, id: criado.user.id })
  }

  if (corpo.acao === 'atualizar') {
    const { id, nome, papel, ativo, senha } = corpo as {
      id?: string
      nome?: string
      papel?: string
      ativo?: boolean
      senha?: string
    }
    if (!id) return json({ erro: 'id é obrigatório' }, 400)
    if (papel !== undefined && !PAPEIS.includes(papel)) return json({ erro: 'Papel inválido' }, 400)

    if (senha !== undefined && senha.length < 8) {
      return json({ erro: 'Senha precisa de no mínimo 8 caracteres' }, 400)
    }

    const rebaixandoOuDesativando =
      (papel !== undefined && papel !== 'admin') || ativo === false

    if (id === chamadorId && rebaixandoOuDesativando) {
      return json({ erro: 'Você não pode rebaixar ou desativar a própria conta.' }, 400)
    }

    if (rebaixandoOuDesativando) {
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('papel', 'admin')
        .eq('ativo', true)
        .neq('id', id)
      if (!count || count === 0) {
        return json({ erro: 'Não é possível rebaixar ou desativar o último administrador ativo.' }, 400)
      }
    }

    const patch: Record<string, unknown> = {}
    if (nome !== undefined) patch.nome = nome
    if (papel !== undefined) patch.papel = papel
    if (ativo !== undefined) patch.ativo = ativo

    if (Object.keys(patch).length > 0) {
      const { error: updErro } = await admin.from('profiles').update(patch).eq('id', id)
      if (updErro) return json({ erro: 'Não foi possível atualizar o usuário.' }, 500)
    }

    if (senha) {
      const { error: senhaErro } = await admin.auth.admin.updateUserById(id, { password: senha })
      if (senhaErro) return json({ erro: 'Não foi possível trocar a senha.' }, 500)
    }

    return json({ ok: true })
  }

  return json({ erro: 'Ação inválida' }, 400)
})
