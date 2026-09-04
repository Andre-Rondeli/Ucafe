/**
 * Busca por texto em lista, do jeito que se digita no Brasil.
 *
 * Duas coisas que a comparação crua erra e que custam a venda: acento e caixa. Quem digita
 * "sao gabriel" com o teclado do celular espera achar "São Gabriel", e quem digita
 * "PADARIA" espera achar "Padaria do Zé". `normalize('NFD')` separa a letra do acento e o
 * intervalo `̀-ͯ` remove só os acentos — a letra fica.
 */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

/**
 * Filtra por QUALQUER um dos campos, e o termo é quebrado em palavras: "zé itabuna" acha
 * "Padaria do Zé" em "Itabuna", mesmo com as palavras vindo de campos diferentes e fora de
 * ordem. Buscar a frase inteira exigiria que a pessoa digitasse na ordem exata do cadastro.
 *
 * Termo vazio devolve a lista inteira — a busca é atalho, não portão.
 */
export function filtrarPorTexto<T>(itens: T[], termo: string, campos: (item: T) => (string | null | undefined)[]): T[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return itens
  return itens.filter((item) => {
    const alvo = campos(item).map(normalizar).join(' ')
    return palavras.every((palavra) => alvo.includes(palavra))
  })
}
