/** Formatadores de exibição usados nas telas — única fonte, para não duplicar semântica diferente com o mesmo nome. */

export function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function kgTexto(valor: number): string {
  return `${valor.toLocaleString('pt-BR')} kg`
}

/** Número solto na tela (dias, percentual): vírgula decimal, senão sai "26.74 dias" num app PT-BR. */
export function numeroTexto(valor: number): string {
  return valor.toLocaleString('pt-BR')
}

/** "1 dia" / "2 dias" — concordância, com o número já em PT-BR. */
export function diasTexto(valor: number): string {
  return `${numeroTexto(valor)} ${Math.abs(valor) === 1 ? 'dia' : 'dias'}`
}

/** dd/mm — sem ano, para exibição dentro de uma janela/série onde o ano é óbvio pelo contexto. */
export function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** dd/mm/aaaa — com ano, para histórico e vigência onde o ano importa. */
export function dataLonga(iso: string): string {
  return iso.split('-').reverse().join('/')
}

/** hh:mm no fuso do aparelho — para dizer quando um número vindo de fora foi lido. */
export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
