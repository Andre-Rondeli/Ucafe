/**
 * Documento do cliente: normalizar, validar e formatar CNPJ/CPF.
 *
 * Documento é a única chave confiável para não duplicar cadastro: casar cliente por nome
 * mistura empresa — a mesma razão social aparece repetida, com erro de digitação em uma
 * das cópias.
 */

/** Só os dígitos. `null` quando não sobra um documento de tamanho plausível. */
export function digitosDoDocumento(texto: string | null | undefined): string | null {
  if (!texto) return null
  const digitos = texto.replace(/\D/g, '')
  return digitos.length === 11 || digitos.length === 14 ? digitos : null
}

function digitoVerificador(base: string, pesoInicial: number): number {
  let peso = pesoInicial
  let soma = 0
  for (const caractere of base) {
    soma += Number(caractere) * peso
    peso -= 1
    if (peso < 2) peso = 9
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/**
 * CNPJ com dígito verificador correto.
 *
 * Serve para não gastar uma consulta à Receita com número digitado torto — e para a tela
 * dizer "confira o número" em vez de "não encontrado", que manda o vendedor procurar o
 * problema no lugar errado. NÃO bloqueia o cadastro: documento estranho existe (cliente
 * antigo, CNPJ de outra praça) e travar a venda por causa disso seria pior.
 */
export function cnpjValido(documento: string | null | undefined): boolean {
  const digitos = (documento ?? '').replace(/\D/g, '')
  if (digitos.length !== 14) return false
  // 00000000000000, 11111111111111...: passam na conta do DV e não são CNPJ de ninguém
  if (/^(\d)\1{13}$/.test(digitos)) return false
  const primeiro = digitoVerificador(digitos.slice(0, 12), 5)
  const segundo = digitoVerificador(digitos.slice(0, 12) + primeiro, 6)
  return digitos === `${digitos.slice(0, 12)}${primeiro}${segundo}`
}

/** CPF com dígito verificador correto. Mesma régua do CNPJ: avisa, não trava. */
export function cpfValido(documento: string | null | undefined): boolean {
  const digitos = (documento ?? '').replace(/\D/g, '')
  if (digitos.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digitos)) return false
  const primeiro = digitoVerificador(digitos.slice(0, 9), 10)
  const segundo = digitoVerificador(digitos.slice(0, 9) + primeiro, 11)
  return digitos === `${digitos.slice(0, 9)}${primeiro}${segundo}`
}

/** 12.345.678/0001-95 e 123.456.789-09 — o formato que o vendedor confere de bater o olho. */
export function documentoFormatado(documento: string | null | undefined): string {
  const digitos = (documento ?? '').replace(/\D/g, '')
  if (digitos.length === 14) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`
  }
  if (digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
  }
  return digitos
}

/** 01311902 -> 01311-902. Vazio continua vazio. */
export function cepFormatado(cep: string | null | undefined): string | null {
  const digitos = (cep ?? '').replace(/\D/g, '')
  if (digitos.length !== 8) return cep?.trim() || null
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`
}

const MINUSCULAS = new Set(['de', 'da', 'das', 'do', 'dos', 'e'])
const SIGLAS = new Set(['ltda', 'me', 'epp', 'eireli', 'mei', 'sa', 's/a', 'cia', 'ii', 'iii'])

/**
 * A Receita devolve tudo em CAIXA ALTA. "PADARIA DO ZE LTDA" numa lista de celular grita
 * e ainda ocupa mais largura que o mesmo nome em caixa de título.
 */
export function emCaixaDeTitulo(texto: string | null | undefined): string | null {
  const limpo = (texto ?? '').trim().replace(/\s+/g, ' ')
  if (!limpo) return null
  // já veio com minúsculas: é texto que alguém digitou, não do cadastro da Receita
  if (limpo !== limpo.toUpperCase()) return limpo
  return limpo
    .toLowerCase()
    .split(' ')
    .map((palavra, indice) => {
      if (SIGLAS.has(palavra)) return palavra.toUpperCase()
      if (indice > 0 && MINUSCULAS.has(palavra)) return palavra
      return palavra.charAt(0).toUpperCase() + palavra.slice(1)
    })
    .join(' ')
}

/** Telefone da Receita: 1123851939 -> 1123851939 (só dígitos, sem DDI). */
export function telefoneEmDigitos(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  // 10 = fixo com DDD, 11 = celular com DDD. Fora disso o cadastro da Receita está
  // incompleto e um número pela metade no WhatsApp é pior que campo vazio.
  return digitos.length === 10 || digitos.length === 11 ? digitos : null
}

// ---------------------------------------------------------------- o que a função devolve
