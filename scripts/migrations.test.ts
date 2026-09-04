import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * O fluxo de migration tem um degrau MANUAL: aplicar no banco é uma ação de gente, não
 * do build. Num projeto irmão esse degrau engoliu duas migrations inteiras — mergeadas,
 * com a Edge Function que dependia delas publicada, e o banco sem nenhuma das duas. O app
 * ficou pronto para gravar numa coluna que não existia.
 *
 * Estes testes são a única barreira que não depende de alguém lembrar.
 */

const PASTA = join(process.cwd(), 'supabase', 'migrations')
const REGISTRO = join(process.cwd(), 'supabase', 'APLICADAS.md')

/** `20260824175000_vendedor_no_erp.sql` -> `{ version: '20260824175000', nome: 'vendedor_no_erp' }` */
function partes(arquivo: string): { version: string; nome: string } {
  const casou = /^(\d+)_(.+)\.sql$/.exec(arquivo)
  if (!casou) throw new Error(`Nome fora do padrão <numero>_<nome>.sql: ${arquivo}`)
  return { version: casou[1], nome: casou[2] }
}

const arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort()

/** Só as linhas de item da seção "Aplicadas" — o resto do arquivo é explicação. */
function nomesRegistrados(): string[] {
  return readFileSync(REGISTRO, 'utf8')
    .split('\n')
    .map((linha) => /^-\s+([a-z0-9_]+)\s*$/.exec(linha.trim())?.[1])
    .filter((nome): nome is string => !!nome)
}

describe('migrations', () => {
  it('tem migration para conferir', () => {
    expect(arquivos.length).toBeGreaterThan(0)
  })

  it('todo arquivo segue <numero>_<nome>.sql', () => {
    for (const arquivo of arquivos) expect(() => partes(arquivo)).not.toThrow()
  })

  /**
   * A colisão que custou caro: `preco_por_cliente` e `vendedor_no_erp` nasceram com o
   * mesmo `20260824170000`. O `version` é CHAVE em `schema_migrations`, então assim que a
   * primeira sobe o Supabase considera o número aplicado e pula a segunda — sem erro, sem
   * aviso, para sempre.
   */
  it('nenhuma version repetida — número repetido faz o push pular a segunda em silêncio', () => {
    const porVersion = new Map<string, string[]>()
    for (const arquivo of arquivos) {
      const { version } = partes(arquivo)
      porVersion.set(version, [...(porVersion.get(version) ?? []), arquivo])
    }
    const colididas = [...porVersion.entries()].filter(([, lista]) => lista.length > 1)
    expect(colididas.map(([version, lista]) => `${version}: ${lista.join(' + ')}`)).toEqual([])
  })

  it('nenhum nome repetido — a conferência contra o banco é por nome', () => {
    const nomes = arquivos.map((a) => partes(a).nome)
    expect(nomes.filter((n, i) => nomes.indexOf(n) !== i)).toEqual([])
  })

  /**
   * A trava do degrau manual. Arquivo novo sem linha nova em APLICADAS.md quebra aqui —
   * obrigando alguém a decidir conscientemente "sim, já apliquei" em vez de esquecer.
   */
  it('toda migration do repo está registrada como aplicada em APLICADAS.md', () => {
    const registradas = new Set(nomesRegistrados())
    const faltando = arquivos.map((a) => partes(a).nome).filter((nome) => !registradas.has(nome))
    expect(faltando, `Aplique no banco e registre em supabase/APLICADAS.md: ${faltando.join(', ')}`).toEqual([])
  })

  it('APLICADAS.md não lista migration que não existe mais no repo', () => {
    const doRepo = new Set(arquivos.map((a) => partes(a).nome))
    expect(nomesRegistrados().filter((nome) => !doRepo.has(nome))).toEqual([])
  })
})
