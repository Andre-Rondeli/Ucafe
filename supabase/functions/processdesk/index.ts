// Edge Function: ponte Torrão ← ProcessDesk (o sistema das lojas da Rede Rondelli).
//
// Roda no servidor porque é a única dona do segredo: PROCESSDESK_FEED_KEY é a credencial
// que abre a porta do outro lado e NUNCA pode aparecer no bundle do navegador.
//
// Uma vez por dia (pg_cron às 6h30 da Bahia) ela busca quanto do café Torrão saiu em cada
// loja e quanto ainda tem lá, e grava em `rede_dia`. Documento técnico:
// docs/ESPELHO-REDE-TECNICO.md · funcional: docs/ESPELHO-REDE-COMO-FUNCIONA.md
//
//
// O que ela deliberadamente NÃO faz:
//   - não escreve NADA no ProcessDesk. A ponte é de leitura;
//   - não decide quais produtos são do Torrão. Quem decide é o ProcessDesk, pelo vínculo
//     de indústria — aqui não há nem como pedir produto de outra marca;
//   - não apaga o espelho quando a origem vem vazia (ver decidirSeGrava em src/lib/rede.ts).
//
// A regra que decide vive em src/lib/rede.ts, testada por vitest. É importada daqui com
// extensão .ts porque o Deno exige — assim existe UMA cópia da regra, não duas divergindo
// em silêncio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  calcularDesde,
  decidirSeGrava,
  fundirFeed,
  type EstoqueDoFeed,
  type LinhaDaRede,
  type VendaDoFeed,
} from '../../../src/lib/rede.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // Lista canônica do próprio supabase-js (SUPABASE_HEADERS) + x-region + x-rotina-token.
  // Header de fora da lista faz o preflight falhar e o navegador nem invoca a função — foi
  // assim que o cadastro de pessoa parou de funcionar uma vez. O teste de contrato trava isso.
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

/** Upsert em lotes: 1.700 linhas numa tacada só estoura o limite de payload. */
const LOTE = 500

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey)

  // --- autorização, sempre antes de tocar no corpo ---
  //
  // Duas portas, as mesmas da rotina de recompra:
  //   1. `x-rotina-token` — o pg_cron. O token nasce DENTRO do banco (`rotina_config`).
  //   2. admin logado — para rodar à mão pela tela, sem esperar as 6h30.
  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  const tokenRotina = req.headers.get('x-rotina-token') ?? ''

  let ehRotina = !!serviceKey && jwt === serviceKey
  if (!ehRotina && tokenRotina) {
    const { data: config } = await admin.from('rotina_config').select('token').maybeSingle()
    const esperado = (config as { token?: string } | null)?.token
    ehRotina = !!esperado && esperado === tokenRotina
  }

  if (!ehRotina) {
    if (!jwt) return json({ erro: 'Não autenticado' }, 401)
    const comoChamador = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: usuario, error: erroUsuario } = await comoChamador.auth.getUser()
    if (erroUsuario || !usuario.user) return json({ erro: 'Sessão inválida' }, 401)
    const { data: perfil } = await admin
      .from('profiles')
      .select('papel, ativo')
      .eq('id', usuario.user.id)
      .single()
    if (!perfil || !perfil.ativo) return json({ erro: 'Usuário inativo' }, 403)
    if (perfil.papel !== 'admin') {
      return json({ erro: 'Só administradores sincronizam o espelho da rede.' }, 403)
    }
  }

  let corpo: { acao?: string }
  try {
    corpo = await req.json()
  } catch {
    corpo = {}
  }
  if (corpo.acao !== 'sincronizar') {
    return json({ erro: `Ação desconhecida: ${corpo.acao ?? '(vazia)'}` }, 400)
  }

  const feedUrl = Deno.env.get('PROCESSDESK_FEED_URL')
  const feedKey = Deno.env.get('PROCESSDESK_FEED_KEY')
  // Segredo faltando é erro de configuração, e precisa dizer isso em vez de virar um
  // 401 do outro lado que pareceria "a chave foi revogada".
  if (!feedUrl || !feedKey) {
    const detalhe = 'PROCESSDESK_FEED_URL e/ou PROCESSDESK_FEED_KEY não configurados nos segredos do projeto.'
    await admin.from('rede_sync_execucoes').insert({ resultado: 'erro', detalhe })
    return json({ erro: detalhe }, 500)
  }

  // --- de onde continuar ---
  const { data: ultimo } = await admin
    .from('rede_dia')
    .select('dia')
    .order('dia', { ascending: false })
    .limit(1)
    .maybeSingle()
  const desde = calcularDesde((ultimo as { dia?: string } | null)?.dia ?? null)

  // count exato, não estimativa: é ele que decide se a trava de completude dispara.
  const { count: jaNoEspelho } = await admin
    .from('rede_dia')
    .select('dia', { count: 'exact', head: true })

  // --- busca no ProcessDesk ---
  let resposta: Response
  try {
    resposta = await fetch(feedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-industria-key': feedKey },
      body: JSON.stringify({ desde }),
    })
  } catch (e) {
    const detalhe = `Não foi possível falar com o ProcessDesk: ${e instanceof Error ? e.message : String(e)}`
    await admin.from('rede_sync_execucoes').insert({ desde, resultado: 'erro', detalhe })
    return json({ erro: detalhe }, 502)
  }

  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => '')
    const detalhe = `O ProcessDesk recusou a consulta (HTTP ${resposta.status}): ${texto.slice(0, 300)}`
    await admin.from('rede_sync_execucoes').insert({ desde, resultado: 'erro', detalhe })
    return json({ erro: detalhe }, 502)
  }

  const feed = (await resposta.json()) as {
    desde?: string
    gerado_em?: string
    vendas?: VendaDoFeed[]
    estoque?: EstoqueDoFeed[]
  }
  const vendas = feed.vendas ?? []
  const estoques = feed.estoque ?? []

  // --- trava de completude, ANTES de escrever qualquer coisa ---
  const veredicto = decidirSeGrava(vendas.length, jaNoEspelho ?? 0)
  if (!veredicto.grava) {
    await admin.from('rede_sync_execucoes').insert({
      desde,
      resultado: 'recusado_vazio',
      linhas_venda: 0,
      linhas_estoque: estoques.length,
      linhas_gravadas: 0,
      detalhe: veredicto.motivo,
    })
    return json({ erro: veredicto.motivo }, 409)
  }

  const linhas: LinhaDaRede[] = fundirFeed(vendas, estoques)

  let gravadas = 0
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE)
    const { error } = await admin
      .from('rede_dia')
      .upsert(lote, { onConflict: 'dia,loja_codigo,produto_codigo' })
    if (error) {
      const detalhe = `Falha ao gravar o espelho a partir da linha ${i}: ${error.message}`
      await admin.from('rede_sync_execucoes').insert({
        desde,
        resultado: 'erro',
        linhas_venda: vendas.length,
        linhas_estoque: estoques.length,
        linhas_gravadas: gravadas,
        detalhe,
      })
      // Devolve o parcial em vez de fingir sucesso: metade gravada é um estado real, e
      // quem lê o log precisa saber que foi metade.
      return json({ erro: detalhe, linhas_gravadas: gravadas }, 500)
    }
    gravadas += lote.length
  }

  await admin.from('rede_sync_execucoes').insert({
    desde,
    resultado: 'ok',
    linhas_venda: vendas.length,
    linhas_estoque: estoques.length,
    linhas_gravadas: gravadas,
    detalhe: feed.gerado_em ? `feed gerado em ${feed.gerado_em}` : null,
  })

  return json({
    ok: true,
    desde,
    linhas_venda: vendas.length,
    linhas_estoque: estoques.length,
    linhas_gravadas: gravadas,
  })
})
