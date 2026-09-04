import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { corsHeaders } from '@supabase/supabase-js/cors'

// Este arquivo não roda a Edge Function (ela é Deno). Ele lê o FONTE e trava as promessas
// que não podem se perder num refactor futuro — mesma tática do contrato da `agrofacil`.
// `\r\n` -> `\n` na leitura porque o repo está com `core.autocrlf=true`: sem isso, toda
// asserção que procura um `\n` literal passa para quem escreveu e falha para quem clonou.
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

describe('CORS da Edge Function processdesk', () => {
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

describe('quem pode sincronizar', () => {
  it('exige rotina OU admin — vendedor e motorista não puxam dado da rede', () => {
    expect(codigo).toMatch(/perfil\.papel\s*!==\s*'admin'/)
    expect(codigo).toMatch(/ehRotina/)
  })

  it('confere o token da rotina contra rotina_config, e não contra literal no código', () => {
    expect(codigo).toMatch(/from\('rotina_config'\)/)
  })
})

describe('a trava de completude', () => {
  // A ordem é a trava: decidir DEPOIS de gravar não protege nada.
  it('decide antes de qualquer upsert no espelho', () => {
    const ondeDecide = codigo.indexOf('decidirSeGrava(')
    const ondeGrava = codigo.indexOf(".from('rede_dia')\n      .upsert")
    const ondeGravaAlt = codigo.indexOf('.upsert(')
    expect(ondeDecide, 'decidirSeGrava precisa ser chamada').toBeGreaterThan(-1)
    const primeiroUpsert = ondeGrava > -1 ? ondeGrava : ondeGravaAlt
    expect(primeiroUpsert, 'precisa existir um upsert').toBeGreaterThan(-1)
    expect(ondeDecide).toBeLessThan(primeiroUpsert)
  })

  it('a decisão vem de src/lib/rede.ts, não reimplementada aqui', () => {
    expect(codigo).toMatch(/from '\.\.\/\.\.\/\.\.\/src\/lib\/rede\.ts'/)
  })

  it('funde venda e estoque antes de gravar, em vez de dois upserts em sequência', () => {
    expect(codigo).toMatch(/fundirFeed\(/)
    // Um upsert só em rede_dia. Dois seria o caminho que apaga estoque com null.
    const upserts = codigo.match(/\.upsert\(/g) ?? []
    expect(upserts).toHaveLength(1)
  })
})

describe('o segredo do feed', () => {
  it('vem dos segredos do projeto, nunca de literal no código', () => {
    expect(codigo).toMatch(/Deno\.env\.get\('PROCESSDESK_FEED_KEY'\)/)
    // 64 hex seguidos seria a própria chave escrita à mão aqui dentro.
    expect(codigo).not.toMatch(/[0-9a-f]{64}/)
  })

  it('nunca é devolvido na resposta nem gravado no log da rodada', () => {
    // feedKey só pode aparecer onde ele é lido e onde é mandado no header.
    const usos = [...codigo.matchAll(/feedKey/g)].length
    expect(usos, 'feedKey usado em mais lugares do que ler + mandar no header').toBeLessThanOrEqual(
      4,
    )
    expect(codigo).not.toMatch(/detalhe:.*feedKey/)
    expect(codigo).not.toMatch(/json\(\{[^}]*feedKey/)
  })
})

describe('a ponte é de leitura', () => {
  it('só fala com o ProcessDesk pela URL do feed configurada', () => {
    const fetches = [...codigo.matchAll(/fetch\(/g)].length
    expect(fetches, 'mais de um fetch: alguém abriu outra rota para o ProcessDesk').toBe(1)
    expect(codigo).toMatch(/fetch\(feedUrl/)
  })

  it('registra a rodada mesmo quando ela falha', () => {
    const inserts = [...codigo.matchAll(/from\('rede_sync_execucoes'\)/g)].length
    expect(inserts, 'faltou registrar algum caminho de falha').toBeGreaterThanOrEqual(4)
  })
})
