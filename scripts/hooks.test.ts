import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/*
 * Trava contra o erro #310 do React ("Rendered more hooks than during the previous render").
 *
 * Aconteceu de verdade em produção em 24/08/2026: `Clientes.tsx` tinha um `useMemo` DEPOIS
 * de `if (isLoading) return <Carregando />`. Enquanto carregava, a tela rodava um hook a
 * menos; quando o dado chegava, rodava um a mais — e o React derrubava a tela inteira. O
 * `tsc` não vê isso e não há teste de render aqui, então a trava é sobre o texto do arquivo,
 * como `pwa.test.ts` já faz com o service worker.
 *
 * A conferência é POR FUNÇÃO, não por arquivo: `Analise.tsx` tem seis componentes no mesmo
 * arquivo, e o `return null` de um não diz nada sobre os hooks do vizinho. Olhar o arquivo
 * inteiro dava três falsos positivos.
 *
 * ponytail: corta a função no `function` de coluna zero, então só enxerga componente
 * declarado no topo do arquivo — que é como este repo escreve. Componente aninhado ou
 * arrow function no topo passariam batido. Se um dia isso importar, o passo seguinte é o
 * eslint-plugin-react-hooks (regra `rules-of-hooks`), que entende escopo de verdade.
 */
const raiz = (caminho: string) => fileURLToPath(new URL(`../${caminho}`, import.meta.url))

const PASTAS = ['src/paginas', 'src/componentes']
const INICIO_DE_FUNCAO = /^(?:export\s+(?:default\s+)?)?function\s/
const SAIDA_ANTECIPADA = /^\s{2}if\s*\(.*\)\s*return\b/
const CHAMADA_DE_HOOK = /^\s{2}(?:const|let)\s.*\buse[A-Z]\w*\(/

/** Quebra o arquivo em blocos, um por função declarada na coluna zero. */
function porFuncao(linhas: string[]): { nome: string; inicio: number; linhas: string[] }[] {
  const blocos: { nome: string; inicio: number; linhas: string[] }[] = []
  for (const [i, linha] of linhas.entries()) {
    if (INICIO_DE_FUNCAO.test(linha)) {
      blocos.push({ nome: linha.trim().slice(0, 60), inicio: i, linhas: [] })
    }
    blocos.at(-1)?.linhas.push(linha)
  }
  return blocos
}

describe('regra dos hooks', () => {
  const arquivos = PASTAS.flatMap((pasta) =>
    readdirSync(raiz(pasta))
      .filter((nome) => nome.endsWith('.tsx'))
      .map((nome) => `${pasta}/${nome}`),
  )

  it('achou telas para conferir', () => {
    expect(arquivos.length).toBeGreaterThan(10)
  })

  it.each(arquivos)('%s não chama hook depois de return antecipado', (arquivo) => {
    const linhas = readFileSync(raiz(arquivo), 'utf-8').split(/\r?\n/)
    const infracoes: string[] = []

    for (const bloco of porFuncao(linhas)) {
      const saida = bloco.linhas.findIndex((linha) => SAIDA_ANTECIPADA.test(linha))
      if (saida === -1) continue
      for (const [i, linha] of bloco.linhas.entries()) {
        if (i > saida && CHAMADA_DE_HOOK.test(linha)) {
          infracoes.push(`linha ${bloco.inicio + i + 1} (em "${bloco.nome}"): ${linha.trim()}`)
        }
      }
    }

    expect(infracoes, 'mova o hook para ANTES da saída antecipada da mesma função').toEqual([])
  })
})
