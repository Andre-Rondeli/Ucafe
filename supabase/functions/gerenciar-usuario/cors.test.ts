import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// A lista canônica de headers que o SDK manda vem do próprio SDK. Se um upgrade do
// supabase-js acrescentar header novo, este teste quebra ANTES de o preflight quebrar em
// produção -- foi exatamente assim que o cadastro de pessoa parou de funcionar uma vez.
import { corsHeaders } from '@supabase/supabase-js/cors'

const fonte = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf-8')

/** Lê a lista de headers do bloco CORS da própria Edge Function. */
function headersLiberados(): string[] {
  const bloco = fonte.match(/'Access-Control-Allow-Headers':\s*'([^']*)'/)
  return (bloco?.[1] ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

function headersDoSdk(): string[] {
  return corsHeaders['Access-Control-Allow-Headers']
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

describe('CORS da Edge Function gerenciar-usuario', () => {
  it('libera todos os headers que o supabase-js manda', () => {
    const liberados = headersLiberados()
    expect(liberados.length).toBeGreaterThan(0)
    for (const header of headersDoSdk()) {
      expect(liberados, `header ${header} precisa estar em Access-Control-Allow-Headers`).toContain(
        header,
      )
    }
  })

  it('responde ao preflight e aceita POST', () => {
    expect(fonte).toContain("req.method === 'OPTIONS'")
    expect(fonte).toMatch(/'Access-Control-Allow-Methods':\s*'[^']*POST[^']*'/)
  })

  it('devolve os headers de CORS tambem nas respostas de erro', () => {
    // sem CORS na resposta de erro o navegador esconde o 401/403 e a tela mostra
    // "erro de rede" em vez da mensagem real
    expect(fonte).toMatch(/headers:\s*\{\s*\.\.\.CORS/)
  })

  it('exige token e papel de admin antes de tocar no corpo da requisicao', () => {
    const posicaoAuth = fonte.indexOf("if (!jwt) return json({ erro: 'Não autenticado' }, 401)")
    const posicaoAdmin = fonte.indexOf('Só administradores podem gerenciar a equipe.')
    const posicaoCorpo = fonte.indexOf('await req.json()')
    expect(posicaoAuth).toBeGreaterThan(-1)
    expect(posicaoAdmin).toBeGreaterThan(-1)
    expect(posicaoAdmin).toBeLessThan(posicaoCorpo)
  })

  it('so aceita os papeis do enum papel_usuario -- nem mais, nem menos', () => {
    // Lê a lista em vez de casar o literal inteiro: o que importa é o CONJUNTO.
    // Papel a mais aqui cria conta com permissão que a RLS não conhece; papel a menos
    // impede o admin de criar (400 "Papel inválido") -- foi o que travou o motorista.
    const bloco = fonte.match(/const PAPEIS = \[([^\]]*)\]/)
    const papeis = (bloco?.[1] ?? '')
      .split(',')
      .map((p) => p.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
    expect(papeis.sort()).toEqual(['admin', 'motorista', 'vendedor'])
  })
})
