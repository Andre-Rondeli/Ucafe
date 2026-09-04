/** Arredonda para 2 casas decimais evitando o erro de ponto flutuante do JS. */
export function arredondar2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

/**
 * Converte texto digitado (PT-BR ou ponto) para número. Sem vírgula, o ponto é decimal
 * (ex.: '50.001'). Com vírgula, ela é o decimal e o(s) ponto(s) viram separador de milhar
 * (ex.: '1.234,56'). Sinal negativo é aceito; validação de sinal é responsabilidade da tela.
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim()
  if (!/^-?[0-9.,]+$/.test(limpo)) return NaN

  const virgulas = (limpo.match(/,/g) ?? []).length
  if (virgulas > 1) return NaN

  let normalizado: string
  if (virgulas === 1) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  } else {
    if ((limpo.match(/\./g) ?? []).length > 1) return NaN
    normalizado = limpo
  }

  const valor = Number(normalizado)
  return Number.isNaN(valor) ? NaN : valor
}

/**
 * Preço digitado à mão (ajuste manual no pedido). Campo vazio = não há ajuste.
 * Texto que não é preço devolve erro em PT-BR — nunca cai calado no preço de tabela,
 * senão o vendedor acha que deu desconto e o pedido salva no valor cheio.
 */
export function precoDigitado(texto: string): { valor: number | null; erro: string | null } {
  if (texto.trim() === '') return { valor: null, erro: null }
  const valor = paraNumero(texto)
  if (!Number.isFinite(valor)) {
    return { valor: null, erro: `"${texto.trim()}" não é um preço. Use vírgula ou ponto, por exemplo 10,50.` }
  }
  if (valor <= 0) {
    return { valor: null, erro: 'O preço ajustado precisa ser maior que zero.' }
  }
  return { valor: arredondar2(valor), erro: null }
}
