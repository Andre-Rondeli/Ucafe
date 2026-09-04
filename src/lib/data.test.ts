import { describe, expect, it } from 'vitest'
import { diasUteis, addDias, diffDias, hojeIso, segundaDaSemana } from './data'

describe('addDias', () => {
  it('soma dias dentro do mes', () => {
    expect(addDias('2026-08-03', 7)).toBe('2026-08-10')
  })

  it('atravessa mes e ano', () => {
    expect(addDias('2026-08-25', 30)).toBe('2026-09-24')
    expect(addDias('2026-12-20', 60)).toBe('2027-02-18')
  })

  it('respeita ano bissexto', () => {
    expect(addDias('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('aceita dias negativos', () => {
    expect(addDias('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('diffDias', () => {
  it('conta dias entre duas datas', () => {
    expect(diffDias('2026-08-03', '2026-08-10')).toBe(7)
    expect(diffDias('2026-08-10', '2026-08-03')).toBe(-7)
    expect(diffDias('2026-08-03', '2026-08-03')).toBe(0)
  })
})

describe('hojeIso', () => {
  // A regressão real: 22h30 na Bahia já é o dia seguinte em UTC. Com toISOString() o
  // pedido lançado à noite nascia com a data de amanhã (mês errado na comissão, data
  // errada no romaneio). Os instantes abaixo são absolutos — o teste vale em qualquer
  // máquina, independente do TZ de quem roda.
  it('usa o calendario da Bahia, nao o de UTC', () => {
    // 2026-08-04T01:30:00Z = 2026-08-03 22:30 na Bahia
    expect(hojeIso(new Date('2026-08-04T01:30:00Z'))).toBe('2026-08-03')
    // 2026-09-01T02:00:00Z = 2026-08-31 23:00 na Bahia -> ainda é agosto (virada de mês)
    expect(hojeIso(new Date('2026-09-01T02:00:00Z'))).toBe('2026-08-31')
  })

  it('vira o dia as 00h da Bahia', () => {
    expect(hojeIso(new Date('2026-08-04T02:59:59Z'))).toBe('2026-08-03')
    expect(hojeIso(new Date('2026-08-04T03:00:00Z'))).toBe('2026-08-04')
  })

  it('devolve sempre YYYY-MM-DD', () => {
    expect(hojeIso(new Date('2026-01-05T15:00:00Z'))).toBe('2026-01-05')
  })
})

describe('segundaDaSemana', () => {
  it('devolve a segunda-feira da semana da data', () => {
    // 2026-08-03 e uma segunda-feira
    expect(segundaDaSemana('2026-08-03')).toBe('2026-08-03')
    expect(segundaDaSemana('2026-08-06')).toBe('2026-08-03')
    expect(segundaDaSemana('2026-08-09')).toBe('2026-08-03') // domingo -> segunda anterior
  })
})

describe('diasUteis', () => {
  it('conta segunda a sexta e ignora o fim de semana', () => {
    // 24/08/2026 é segunda; 30/08 é domingo
    expect(diasUteis('2026-08-24', '2026-08-30')).toBe(5)
  })

  it('inclui as duas pontas', () => {
    expect(diasUteis('2026-08-24', '2026-08-24')).toBe(1) // segunda
    expect(diasUteis('2026-08-29', '2026-08-29')).toBe(0) // sábado
  })

  it('agosto de 2026 tem 21 dias úteis', () => {
    expect(diasUteis('2026-08-01', '2026-08-31')).toBe(21)
  })

  it('intervalo invertido é zero, não negativo', () => {
    expect(diasUteis('2026-08-30', '2026-08-01')).toBe(0)
  })
})
