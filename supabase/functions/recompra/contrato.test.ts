import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { corsHeaders } from '@supabase/supabase-js/cors'

// Não roda a Edge Function (ela é Deno). Lê o FONTE e trava as promessas que não podem se
// perder num refactor futuro. `\r\n` -> `\n` por causa de `core.autocrlf=true`.
const fonte = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf-8').replace(
  /\r\n/g,
  '\n',
)

/** Fonte sem comentário: guarda que dispara na própria documentação é inútil. */
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

function headersLiberados(): string[] {
  const bloco = fonte.match(/'Access-Control-Allow-Headers':\s*\n?\s*'([^']*)'/)
  return (bloco?.[1] ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

describe('CORS da Edge Function recompra', () => {
  it('libera todos os headers que o supabase-js manda', () => {
    const liberados = headersLiberados()
    expect(liberados.length).toBeGreaterThan(0)
    for (const header of corsHeaders['Access-Control-Allow-Headers']
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)) {
      expect(liberados, `header ${header} precisa estar em Access-Control-Allow-Headers`).toContain(
        header,
      )
    }
  })

  it('libera x-rotina-token, senão o pg_cron não consegue chamar', () => {
    expect(headersLiberados()).toContain('x-rotina-token')
  })
})

describe('quem pode disparar o aviso', () => {
  it('exige rotina OU admin — vendedor e motorista não avisam a caixa dos outros', () => {
    expect(codigo).toMatch(/perfil\.papel\s*!==\s*'admin'/)
    expect(codigo).toMatch(/ehRotina/)
  })

  it('confere o token da rotina contra rotina_config, e não contra literal no código', () => {
    expect(codigo).toMatch(/from\('rotina_config'\)/)
    expect(codigo).not.toMatch(/[0-9a-f]{32}/)
  })

  it('autoriza ANTES de ler o corpo do pedido', () => {
    expect(codigo.indexOf('ehRotina')).toBeLessThan(codigo.indexOf('req.json()'))
  })
})

describe('a régua de recompra', () => {
  it('vem de src/lib/recompra.ts, não reimplementada aqui', () => {
    expect(codigo).toMatch(/from '\.\.\/\.\.\/\.\.\/src\/lib\/recompra\.ts'/)
    expect(codigo).toMatch(/prever\(/)
  })

  it('manda UM aviso por dia com a lista dentro, não um por cliente', () => {
    // a data na chave é o que garante isso; sem ela o cron repetiria o push a cada rodada
    expect(codigo).toMatch(/chave: `recompra:\$\{hoje\}`/)
    expect(codigo).toMatch(/ignoreDuplicates: true/)
  })

  it('só avisa quem tem histórico — prospecção não tem ciclo para vencer', () => {
    expect(codigo).toMatch(/historico\.length === 0/)
  })
})
