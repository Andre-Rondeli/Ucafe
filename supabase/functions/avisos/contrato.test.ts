import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { corsHeaders } from '@supabase/supabase-js/cors'

// Não roda a função (ela é Deno): lê o FONTE e trava as promessas que não podem se
// perder num refactor — mesma tática do contrato da função `agrofacil`.
const fonte = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf-8')
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

describe('CORS da Edge Function avisos', () => {
  it('libera todos os headers que o supabase-js manda', () => {
    const bloco = fonte.match(/'Access-Control-Allow-Headers':\s*\n?\s*'([^']*)'/)
    const liberados = (bloco?.[1] ?? '').split(',').map((h) => h.trim().toLowerCase())
    for (const header of corsHeaders['Access-Control-Allow-Headers']
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)) {
      expect(liberados, `header ${header} precisa estar liberado`).toContain(header)
    }
  })

  it('devolve CORS também no erro — senão a tela mostra "erro de rede"', () => {
    expect(codigo).toMatch(/headers:\s*\{\s*\.\.\.CORS/)
    expect(codigo).toContain("req.method === 'OPTIONS'")
  })
})

describe('segredo do push', () => {
  it('a chave PRIVADA nunca sai na resposta', () => {
    // a pública sai (o navegador precisa dela para assinar); a privada só entra no JWT
    const linhasComPrivada = codigo
      .split('\n')
      .filter((linha) => linha.includes('VAPID_PRIVATE_KEY') || linha.includes('privada'))
    for (const linha of linhasComPrivada) {
      expect(linha, `não pode devolver a privada: ${linha.trim()}`).not.toMatch(/json\(/)
    }
    expect(codigo).toContain('VAPID_PRIVATE_KEY')
  })

  it('diz o que fazer quando a chave não está configurada, em vez de falhar calado', () => {
    expect(codigo).toMatch(/gerar-vapid/)
    expect(codigo).toMatch(/503/)
  })
})

describe('autorização', () => {
  it('exige token antes de tocar no corpo da requisição', () => {
    const posicaoToken = codigo.indexOf("if (!jwt) return json({ erro: 'Não autenticado' }, 401)")
    const posicaoCorpo = codigo.indexOf('await req.json()')
    expect(posicaoToken).toBeGreaterThan(-1)
    expect(posicaoToken).toBeLessThan(posicaoCorpo)
  })

  it('só a rotina ou um admin dispara a fila inteira', () => {
    const inicio = codigo.indexOf("acao === 'enviar-pendentes'")
    expect(inicio).toBeGreaterThan(-1)
    expect(codigo.slice(inicio, inicio + 300)).toContain('!ehRotina && !ehAdmin')
  })

  it('o teste de push vai para o celular de QUEM PEDIU, nunca para o de outro', () => {
    const inicio = codigo.indexOf("acao === 'testar'")
    const bloco = codigo.slice(inicio, codigo.indexOf("acao === 'enviar-pendentes'"))
    expect(bloco).toContain("eq('user_id', usuarioId)")
    // sem id vindo do corpo: aceitar `corpo.user_id` viraria "mande um push para o fulano"
    expect(bloco).not.toMatch(/corpo\.\w*user/)
  })
})

describe('entrega do aviso', () => {
  it('assinatura morta (404/410) é desativada, não apagada', () => {
    expect(codigo).toMatch(/status === 404 \|\| resposta\.status === 410/)
    expect(codigo).toContain('desativada_em')
  })

  it('aviso sem aparelho inscrito NÃO é marcado como enviado', () => {
    // marcar sem entregar perderia o aviso para sempre quando a pessoa inscrever o celular
    const inicio = codigo.indexOf('semAssinatura++')
    expect(inicio).toBeGreaterThan(-1)
    const trecho = codigo.slice(inicio - 200, inicio + 100)
    expect(trecho).toContain('continue')
    expect(trecho).not.toContain('enviado_em')
  })

  it('falha de envio guarda o motivo em vez de engolir', () => {
    expect(codigo).toContain('erro_envio')
  })

  it('a fila tem teto por rodada — função que estoura o tempo não entrega nada', () => {
    expect(codigo).toMatch(/\.limit\(200\)/)
  })
})
