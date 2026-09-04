// Edge Function: o aviso das 9h — quem já devia ter repetido o pedido.
//
// Roda no servidor porque escreve aviso para OUTRAS pessoas: `avisos` não tem policy de
// insert de propósito, e só a `service_role` grava ali. Assim ninguém fabrica notificação
// para o celular de um colega.
//
// Quem a chama é o pg_cron (`rodar_rotina_recompra()`, migration 20260824180000), que se
// identifica com um token nascido dentro do próprio banco — nunca com a chave-mestra.
// O admin também pode chamar à mão, pelo app, para não esperar as 9h.
//
// A régua de "está na hora" vive em src/lib/recompra.ts, testada por vitest. É importada
// daqui com extensão .ts porque o Deno exige — assim existe UMA cópia da regra, não duas
// divergindo em silêncio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hojeIso } from '../../../src/lib/data.ts'
import { kgTexto } from '../../../src/lib/formato.ts'
import { prever, type PedidoHistorico } from '../../../src/lib/recompra.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // Lista canônica do próprio supabase-js (SUPABASE_HEADERS) + x-region + x-rotina-token.
  // Header de fora da lista faz o preflight falhar e o navegador nem invoca a função.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, x-region, x-rotina-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface ResultadoRecompra {
  clientes_conferidos: number
  vencidos: number
  avisados: number
  motivos: string[]
}

/**
 * **Um aviso por dia, com a lista dentro** — não um por cliente. Trinta pushes às nove da
 * manhã viram trinta notificações ignoradas; uma que diz "6 clientes na hora" é lida.
 * A `chave` carrega a data, então rodar de novo no mesmo dia não toca o celular de ninguém
 * outra vez.
 *
 * Vencido = a data prevista já passou (`atrasoDias > 0`). É a régua do ciclo DELE: quem
 * compra a cada 7 dias e está 3 atrasado entra; quem compra a cada 60 e está 3, não.
 */
async function avisarRecompras(
  admin: ReturnType<typeof createClient>,
  hoje: string,
): Promise<ResultadoRecompra> {
  const resultado: ResultadoRecompra = {
    clientes_conferidos: 0,
    vencidos: 0,
    avisados: 0,
    motivos: [],
  }

  const [clientes, pedidos] = await Promise.all([
    admin.from('clientes').select('id, nome, cadencia_declarada_dias').eq('ativo', true),
    admin.from('pedidos').select('cliente_id, data, total_kg').neq('status', 'cancelado'),
  ])

  const erro = clientes.error ?? pedidos.error
  if (erro) {
    resultado.motivos.push(erro.message)
    return resultado
  }

  const historicos = new Map<string, PedidoHistorico[]>()
  for (const pedido of pedidos.data ?? []) {
    const clienteId = pedido.cliente_id ? String(pedido.cliente_id) : null
    const data = pedido.data as string | null
    const totalKg = Number(pedido.total_kg ?? 0)
    if (!clienteId || !data || totalKg <= 0) continue
    const lista = historicos.get(clienteId) ?? []
    lista.push({ data: String(data).slice(0, 10), totalKg })
    historicos.set(clienteId, lista)
  }

  const vencidos: { nome: string; atraso: number; sugestaoKg: number | null }[] = []
  for (const cliente of clientes.data ?? []) {
    const historico = historicos.get(String(cliente.id))
    // cliente sem histórico nenhum não tem ciclo para vencer — é prospecção, não recompra
    if (!historico || historico.length === 0) continue
    resultado.clientes_conferidos += 1
    const previsao = prever(
      historico,
      cliente.cadencia_declarada_dias === null ? null : Number(cliente.cadencia_declarada_dias),
      hoje,
    )
    if ((previsao.atrasoDias ?? 0) > 0) {
      vencidos.push({
        nome: String(cliente.nome),
        atraso: previsao.atrasoDias as number,
        sugestaoKg: previsao.qtdSugeridaKg,
      })
    }
  }

  vencidos.sort((a, b) => b.atraso - a.atraso)
  resultado.vencidos = vencidos.length
  if (vencidos.length === 0) return resultado

  // cabe no corpo de uma notificação: os 5 mais atrasados e a conta do resto
  const primeiros = vencidos
    .slice(0, 5)
    .map(
      (c) =>
        `${c.nome} (${c.atraso}d${c.sugestaoKg === null ? '' : `, sugerir ${kgTexto(c.sugestaoKg)}`})`,
    )
    .join(' · ')
  const resto = vencidos.length > 5 ? ` · e mais ${vencidos.length - 5}` : ''

  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('ativo', true)
    .eq('papel', 'admin')
  const destinatarios = (admins ?? []).map((pessoa) => String(pessoa.id))
  if (destinatarios.length === 0) {
    resultado.motivos.push('nenhum admin ativo para avisar')
    return resultado
  }

  // `ignoreDuplicates` sobre (destinatario, chave) é o que deixa a rotina rodar de novo
  // sem tocar o celular de ninguém pela mesma lista.
  const { data: criados, error: erroAviso } = await admin
    .from('avisos')
    .upsert(
      destinatarios.map((destinatario) => ({
        destinatario,
        tipo: 'recompra',
        titulo:
          vencidos.length === 1
            ? '1 cliente na hora de recomprar'
            : `${vencidos.length} clientes na hora de recomprar`,
        corpo: `${primeiros}${resto}`,
        // relatório da fila, não a lista de CADASTRO: quem abre "6 clientes na hora de
        // recomprar" precisa ver QUAIS são os seis, com atraso e quanto sugerir.
        url: '/recompra',
        // a data na chave é o que faz o aviso ser UM por dia, rode a rotina quantas vezes rodar
        chave: `recompra:${hoje}`,
      })),
      { onConflict: 'destinatario,chave', ignoreDuplicates: true },
    )
    .select('id')

  if (erroAviso) {
    resultado.motivos.push(erroAviso.message)
    return resultado
  }
  resultado.avisados = (criados ?? []).length
  return resultado
}

/** Pede à função `avisos` que entregue no celular o que acabou de virar aviso. */
async function dispararPush(): Promise<{ enviados: number; erro: string | null }> {
  const url = Deno.env.get('SUPABASE_URL')
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !chave) return { enviados: 0, erro: 'ambiente sem SUPABASE_URL/SERVICE_ROLE_KEY' }
  try {
    const resposta = await fetch(`${url}/functions/v1/avisos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'enviar-pendentes' }),
    })
    const corpo = (await resposta.json().catch(() => null)) as
      | { enviados?: number; erro?: string }
      | null
    if (!resposta.ok) return { enviados: 0, erro: corpo?.erro ?? `HTTP ${resposta.status}` }
    return { enviados: Number(corpo?.enviados ?? 0), erro: null }
  } catch (e) {
    return { enviados: 0, erro: e instanceof Error ? e.message : 'falha ao chamar avisos' }
  }
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

  const comoChamador = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const admin = createClient(url, serviceKey)

  /*
   * Chamada de ROTINA, sem usuário logado. Duas portas:
   *   1. `x-rotina-token` — o pg_cron. O token nasce DENTRO do banco (`rotina_config`).
   *   2. A própria service_role, quando uma função chama a outra.
   */
  const tokenRotina = req.headers.get('x-rotina-token') ?? ''
  let ehRotina = jwt === serviceKey
  if (!ehRotina && tokenRotina) {
    const { data: config } = await admin.from('rotina_config').select('token').maybeSingle()
    const esperado = (config as { token?: string } | null)?.token
    ehRotina = !!esperado && esperado === tokenRotina
  }

  if (!ehRotina) {
    const { data: usuario, error: erroUsuario } = await comoChamador.auth.getUser()
    if (erroUsuario || !usuario.user) return json({ erro: 'Sessão inválida' }, 401)
    const { data: perfil } = await admin
      .from('profiles')
      .select('papel, ativo')
      .eq('id', usuario.user.id)
      .single()
    if (!perfil || !perfil.ativo) return json({ erro: 'Usuário inativo' }, 403)
    // vendedor e motorista não disparam aviso para a caixa dos outros
    if (perfil.papel !== 'admin') return json({ erro: 'Rotina restrita.' }, 403)
  }

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Corpo inválido' }, 400)
  }

  if (corpo.acao !== 'rotina-recompra') return json({ erro: 'Ação desconhecida' }, 400)

  try {
    const hoje = hojeIso()
    const recompra = await avisarRecompras(admin, hoje)
    const push = recompra.avisados > 0 ? await dispararPush() : { enviados: 0, erro: null }
    return json({ ok: true, hoje, ...recompra, push })
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : 'falha na rotina de recompra' }, 500)
  }
})
