/**
 * Aritmética de data em string ISO YYYY-MM-DD, sempre em UTC.
 * UTC evita o bug clássico de fuso: em UTC-3, new Date('2026-08-03') cai no dia 2.
 */

function paraUtc(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10)
}

export function addDias(iso: string, dias: number): string {
  const data = paraUtc(iso)
  data.setUTCDate(data.getUTCDate() + dias)
  return paraIso(data)
}

/** Dias de `de` até `ate`. Negativo se `ate` for anterior. */
export function diffDias(de: string, ate: string): number {
  const MS_DIA = 86_400_000
  return Math.round((paraUtc(ate).getTime() - paraUtc(de).getTime()) / MS_DIA)
}

/**
 * Dias ÚTEIS (segunda a sexta) entre duas datas, incluindo as duas pontas.
 *
 * A torrefação não torra sábado e domingo, então capacidade e ociosidade se medem em dia
 * útil — contar dia corrido faz a fábrica parecer 40% mais ociosa do que é. Feriado não
 * entra na conta: exigiria calendário municipal, e o erro que ele corrige é pequeno perto
 * do que o fim de semana já corrigiu.
 */
export function diasUteis(inicio: string, fim: string): number {
  if (inicio > fim) return 0
  let total = 0
  for (let dia = inicio; dia <= fim; dia = addDias(dia, 1)) {
    const [ano, mes, numero] = dia.split('-').map(Number)
    const semana = new Date(Date.UTC(ano, mes - 1, numero)).getUTCDay()
    if (semana >= 1 && semana <= 5) total++
  }
  return total
}

/** Segunda-feira da semana da data — chave de agrupamento das séries semanais. */
export function segundaDaSemana(iso: string): string {
  const diaSemana = paraUtc(iso).getUTCDay() // 0 = domingo
  const recuo = diaSemana === 0 ? 6 : diaSemana - 1
  return addDias(iso, -recuo)
}

/**
 * Fuso da operação. A torrefação e os clientes estão na Bahia (UTC-3, sem horário de
 * verão): o "hoje" do negócio é o calendário da Bahia, não o do relógio UTC nem o do
 * aparelho. Sem isso, pedido lançado depois das 21h nasce com a data de amanhã —
 * cai no mês errado da comissão e imprime data errada no romaneio.
 */
const FUSO_OPERACAO = 'America/Bahia'

// en-CA formata exatamente YYYY-MM-DD, que é o formato ISO usado em todo o app
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_OPERACAO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Data de hoje no fuso da operação. Só para a UI — função de cálculo recebe `hoje`
 * por parâmetro. `agora` existe para o teste poder fixar o instante.
 */
export function hojeIso(agora: Date = new Date()): string {
  return FORMATO_DIA.format(agora)
}
