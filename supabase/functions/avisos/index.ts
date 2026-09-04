// Edge Function: entrega os avisos do Torrão no celular (Web Push).
//
// Existe separada das outras por causa do SEGREDO: quem manda push precisa da chave
// privada VAPID, e ela não tem nada a ver com a credencial do ERP. Uma função, um segredo.
//
// O aviso já está gravado na tabela `avisos` antes de chegar aqui — esta função é o
// carteiro, não o recado. Push que falha (permissão revogada, celular trocado, serviço do
// navegador fora do ar) NÃO faz a informação sumir: ela continua na tela do app.
//
// A criptografia (RFC 8291) e o VAPID (RFC 8292) vivem em src/lib/webpush.ts, testados no
// vitest com decifragem de volta — importados aqui com extensão .ts porque o Deno exige.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { montarEnvio, type AssinaturaPush, type ChavesVapid } from '../../../src/lib/webpush.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // mesma lista canônica do supabase-js (SUPABASE_HEADERS) + x-region: header de fora da
  // lista faz o preflight falhar e o navegador nem chama a função
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

/** Forma FIXA da resposta de envio: a tela lê campo por campo e não pode achar undefined. */
function respostaEnvio(extra: Record<string, unknown> = {}) {
  return json({
    ok: true,
    enviados: 0,
    falhas: 0,
    sem_assinatura: 0,
    desativadas: 0,
    motivos: [] as string[],
    ...extra,
  })
}

function chavesVapid(): { chaves: ChavesVapid | null; erro: string | null } {
  const publica = Deno.env.get('VAPID_PUBLIC_KEY')
  const privada = Deno.env.get('VAPID_PRIVATE_KEY')
  const assunto = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:carlos.eduardo@rondelli.com.br'
  if (!publica || !privada) {
    return {
      chaves: null,
      erro:
        'Chaves de push não configuradas. Faltam os secrets VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY ' +
        '(gere com `node scripts/gerar-vapid.mjs`).',
    }
  }
  return { chaves: { publica, privada, assunto }, erro: null }
}

interface LinhaAssinatura {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface LinhaAviso {
  id: string
  destinatario: string
  titulo: string
  corpo: string
  url: string | null
}

/**
 * Manda um aviso para todos os aparelhos da pessoa.
 *
 * 404/410 do serviço de push = aquela assinatura morreu (app desinstalado, permissão
 * revogada, celular trocado). Desativa em vez de apagar: apagar esconderia que a pessoa
 * já tinha aceitado e hoje não recebe mais nada.
 */
async function entregar(
  admin: ReturnType<typeof createClient>,
  chaves: ChavesVapid,
  aviso: LinhaAviso,
  assinaturas: LinhaAssinatura[],
): Promise<{ entregue: boolean; desativadas: number; motivo: string | null }> {
  const mensagem = JSON.stringify({
    titulo: aviso.titulo,
    corpo: aviso.corpo,
    url: aviso.url ?? '/',
    avisoId: aviso.id,
  })

  let entregue = false
  let desativadas = 0
  let ultimoMotivo: string | null = null

  for (const assinatura of assinaturas) {
    const alvo: AssinaturaPush = {
      endpoint: assinatura.endpoint,
      p256dh: assinatura.p256dh,
      auth: assinatura.auth,
    }
    try {
      const envio = await montarEnvio(alvo, chaves, mensagem)
      const resposta = await fetch(envio.url, {
        method: 'POST',
        headers: envio.headers,
        body: envio.body,
      })
      if (resposta.ok) {
        entregue = true
        continue
      }
      const texto = (await resposta.text().catch(() => '')).slice(0, 200)
      ultimoMotivo = `HTTP ${resposta.status} ${texto}`.trim()
      if (resposta.status === 404 || resposta.status === 410) {
        await admin
          .from('push_assinaturas')
          .update({ desativada_em: new Date().toISOString(), ultimo_erro: ultimoMotivo })
          .eq('id', assinatura.id)
        desativadas++
      } else {
        await admin
          .from('push_assinaturas')
          .update({ ultimo_erro: ultimoMotivo })
          .eq('id', assinatura.id)
      }
    } catch (e) {
      ultimoMotivo = e instanceof Error ? e.message : 'falha ao cifrar/enviar'
    }
  }

  return { entregue, desativadas, motivo: entregue ? null : ultimoMotivo }
}

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

  const admin = createClient(url, serviceKey)
  // a rotina (pg_cron / função recompra) se apresenta com a própria service_role
  const ehRotina = jwt === serviceKey
  let usuarioId = ''
  let ehAdmin = false

  if (!ehRotina) {
    const comoChamador = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: usuario, error } = await comoChamador.auth.getUser()
    if (error || !usuario.user) return json({ erro: 'Sessão inválida' }, 401)
    const { data: perfil } = await admin
      .from('profiles')
      .select('papel, ativo')
      .eq('id', usuario.user.id)
      .single()
    if (!perfil || !perfil.ativo) return json({ erro: 'Usuário inativo' }, 403)
    usuarioId = usuario.user.id
    ehAdmin = perfil.papel === 'admin'
  }

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Corpo inválido' }, 400)
  }
  const acao = corpo.acao

  try {
    // ------------------------------------------------------------ chave pública
    // O navegador precisa dela para assinar (`applicationServerKey`). É pública: fica
    // dentro do JWT de todo push que sai. Vem daqui em vez de virar variável de build
    // para trocar a chave não exigir novo deploy do app.
    if (acao === 'chave-publica') {
      const { chaves, erro } = chavesVapid()
      if (!chaves) return json({ erro }, 503)
      return json({ ok: true, chave: chaves.publica })
    }

    // ------------------------------------------------------------ teste no próprio celular
    // O botão que prova a ponta inteira: permissão, assinatura, cifra e o serviço de push.
    if (acao === 'testar') {
      if (ehRotina) return json({ erro: 'A rotina não tem celular para testar.' }, 400)
      const { chaves, erro } = chavesVapid()
      if (!chaves) return json({ erro }, 503)

      const { data: assinaturas } = await admin
        .from('push_assinaturas')
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('user_id', usuarioId)
        .is('desativada_em', null)
      const lista = (assinaturas ?? []) as unknown as LinhaAssinatura[]
      if (lista.length === 0) {
        return respostaEnvio({
          sem_assinatura: 1,
          motivos: ['Este aparelho ainda não está inscrito para receber aviso.'],
        })
      }

      const resultado = await entregar(
        admin,
        chaves,
        {
          id: 'teste',
          destinatario: usuarioId,
          titulo: 'Torrão — aviso de teste',
          corpo: 'Se você está lendo isto no celular, os avisos do app vão chegar.',
          url: '/entregas',
        },
        lista,
      )
      return respostaEnvio({
        enviados: resultado.entregue ? 1 : 0,
        falhas: resultado.entregue ? 0 : 1,
        desativadas: resultado.desativadas,
        motivos: resultado.motivo ? [resultado.motivo] : [],
      })
    }

    // ------------------------------------------------------------ entregar o que está pendente
    if (acao === 'enviar-pendentes') {
      if (!ehRotina && !ehAdmin) return json({ erro: 'Só a rotina ou um admin envia.' }, 403)
      const { chaves, erro } = chavesVapid()
      if (!chaves) return json({ erro }, 503)

      const { data: pendentes, error: erroPendentes } = await admin
        .from('avisos')
        .select('id, destinatario, titulo, corpo, url')
        .is('enviado_em', null)
        .order('criado_em', { ascending: true })
        // teto por rodada: fila grande não pode estourar o tempo da função. O resto sai
        // na próxima — e a fila continua visível na tela mesmo sem push.
        .limit(200)
      if (erroPendentes) return json({ erro: `Não deu para ler a fila: ${erroPendentes.message}` }, 500)

      const avisos = (pendentes ?? []) as unknown as LinhaAviso[]
      if (avisos.length === 0) return respostaEnvio()

      const destinatarios = [...new Set(avisos.map((aviso) => aviso.destinatario))]
      const { data: assinaturas } = await admin
        .from('push_assinaturas')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', destinatarios)
        .is('desativada_em', null)

      const porUsuario = new Map<string, LinhaAssinatura[]>()
      for (const assinatura of (assinaturas ?? []) as unknown as LinhaAssinatura[]) {
        const lista = porUsuario.get(assinatura.user_id) ?? []
        lista.push(assinatura)
        porUsuario.set(assinatura.user_id, lista)
      }

      let enviados = 0
      let falhas = 0
      let semAssinatura = 0
      let desativadas = 0
      const motivos: string[] = []

      for (const aviso of avisos) {
        const lista = porUsuario.get(aviso.destinatario) ?? []
        if (lista.length === 0) {
          // ninguém para entregar: NÃO marca como enviado. Quando a pessoa inscrever o
          // celular, o aviso que importa ainda está na fila.
          semAssinatura++
          continue
        }
        const resultado = await entregar(admin, chaves, aviso, lista)
        desativadas += resultado.desativadas
        if (resultado.entregue) {
          enviados++
          await admin
            .from('avisos')
            .update({ enviado_em: new Date().toISOString(), erro_envio: null })
            .eq('id', aviso.id)
        } else {
          falhas++
          await admin
            .from('avisos')
            .update({ erro_envio: (resultado.motivo ?? 'falha no envio').slice(0, 300) })
            .eq('id', aviso.id)
          if (resultado.motivo && motivos.length < 5) motivos.push(resultado.motivo)
        }
      }

      return respostaEnvio({ enviados, falhas, sem_assinatura: semAssinatura, desativadas, motivos })
    }

    return json({ erro: 'Ação inválida' }, 400)
  } catch (e) {
    console.error('avisos: falha inesperada', e instanceof Error ? e.message : e)
    return json({ erro: 'Falha inesperada ao enviar os avisos.' }, 500)
  }
})
