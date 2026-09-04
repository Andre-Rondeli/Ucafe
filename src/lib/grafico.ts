// Escala de eixo para os gráficos — a parte que decide os números, separada do desenho.
//
// Existe porque "o maior valor da série" é um teto ruim de eixo: dá marcas como 39, 78,
// 117, que ninguém consulta de relance. Quem lê um gráfico para saber quanto vendeu num
// dia mede a barra contra a marca mais próxima, e marca quebrada não serve de régua.

/** Passos aceitáveis dentro de uma década: 1, 2, 5 e 10. */
const PASSOS = [1, 2, 2.5, 5, 10]

/**
 * Um teto redondo e as marcas do eixo.
 *
 * Devolve o menor teto >= max que caia num múltiplo redondo, e as marcas de 0 até ele.
 * `alvoDeMarcas` é uma intenção, não uma promessa: o número final é o que o passo redondo
 * permitir, porque marca redonda em quantidade estranha lê melhor do que marca quebrada
 * na quantidade exata.
 */
export function escalaBonita(max: number, alvoDeMarcas = 3): { teto: number; marcas: number[] } {
  if (!Number.isFinite(max) || max <= 0) return { teto: 1, marcas: [0, 1] }

  const bruto = max / alvoDeMarcas
  const decada = Math.pow(10, Math.floor(Math.log10(bruto)))
  const normalizado = bruto / decada
  const passo = (PASSOS.find((p) => normalizado <= p) ?? 10) * decada

  const teto = Math.ceil(max / passo) * passo
  const marcas: number[] = []
  // Acumula somando, e não multiplicando o índice: com passo 2,5 o erro de ponto
  // flutuante aparecia como 7.500000000000001 no rótulo.
  for (let i = 0; i * passo <= teto + passo / 1000; i++) {
    marcas.push(Math.round(i * passo * 1000) / 1000)
  }
  return { teto, marcas }
}

/**
 * Quais índices da série recebem rótulo de data.
 *
 * Sempre o primeiro e o último — são eles que dizem o período que o desenho cobre. No
 * meio, uma marca a cada `passo` dias, e a marca do meio é DESCARTADA se cair colada na
 * do fim: duas datas sobrepostas são pior que uma a menos.
 */
export function indicesComData(total: number, passo = 7): number[] {
  if (total <= 0) return []
  if (total <= 2) return [...Array(total).keys()]

  const indices: number[] = [0]
  for (let i = passo; i < total - 1; i += passo) indices.push(i)
  const ultimo = total - 1
  // meia distância entre marcas: mais perto que isso, o rótulo encosta no do fim
  if (indices[indices.length - 1] > ultimo - passo / 2) indices.pop()
  indices.push(ultimo)
  return indices
}
