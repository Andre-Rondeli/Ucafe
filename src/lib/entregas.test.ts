import { describe, expect, it } from 'vitest'
import { agruparEntregas, cargaDoDia, fardosDeKg, fardosDoItem } from './entregas'

describe('fardosDeKg', () => {
  it('1 fardo e 5 kg', () => {
    expect(fardosDeKg(5)).toBe(1)
    expect(fardosDeKg(30)).toBe(6)
  })

  it('meio fardo aparece fracionado, nao arredondado -- esconder fracao esconde carga faltando', () => {
    expect(fardosDeKg(7.5)).toBe(1.5)
  })

  it('zero kg e zero fardo', () => {
    expect(fardosDeKg(0)).toBe(0)
  })
})

describe('fardosDoItem', () => {
  it('20 pacotes de 250g fecham 1 fardo', () => {
    expect(fardosDoItem(20, 0.25)).toBe(1)
  })

  it('10 pacotes de 500g fecham 1 fardo', () => {
    expect(fardosDoItem(10, 0.5)).toBe(1)
  })

  it('30 pacotes de 250g dao 1,5 fardo', () => {
    expect(fardosDoItem(30, 0.25)).toBe(1.5)
  })

  it('600 pacotes de 250g dao 30 fardos -- o pedido de 30 fardos do cliente', () => {
    expect(fardosDoItem(600, 0.25)).toBe(30)
  })

  it('peso que nao divide o fardo devolve null em vez de numero inventado', () => {
    expect(fardosDoItem(10, 0.3)).toBeNull()
    expect(fardosDoItem(10, 0)).toBeNull()
  })
})

const ENTREGAS = [
  { id: 'a', dataEntregaPrevista: '2026-08-02', totalKg: 10 },
  { id: 'b', dataEntregaPrevista: '2026-08-04', totalKg: 5 },
  { id: 'c', dataEntregaPrevista: '2026-08-04', totalKg: 15 },
  { id: 'd', dataEntregaPrevista: '2026-08-06', totalKg: 20 },
]

describe('agruparEntregas', () => {
  it('agrupa por dia em ordem crescente e marca atraso', () => {
    const grupos = agruparEntregas(ENTREGAS, '2026-08-04')
    expect(grupos.map((g) => g.dia)).toEqual(['2026-08-02', '2026-08-04', '2026-08-06'])
    expect(grupos.map((g) => g.atrasado)).toEqual([true, false, false])
  })

  it('soma kg e fardos do grupo', () => {
    const grupos = agruparEntregas(ENTREGAS, '2026-08-04')
    expect(grupos[1].kg).toBe(20)
    expect(grupos[1].fardos).toBe(4)
    expect(grupos[1].entregas).toHaveLength(2)
  })

  it('lista vazia devolve lista vazia', () => {
    expect(agruparEntregas([], '2026-08-04')).toEqual([])
  })

  it('entrega de hoje nao conta como atrasada', () => {
    const grupos = agruparEntregas([{ dataEntregaPrevista: '2026-08-04', totalKg: 5 }], '2026-08-04')
    expect(grupos[0].atrasado).toBe(false)
  })
})

describe('cargaDoDia', () => {
  it('conta o que vence hoje E o que esta atrasado -- e o que vai no carro', () => {
    expect(cargaDoDia(ENTREGAS, '2026-08-04')).toEqual({ quantidade: 3, kg: 30, fardos: 6 })
  })

  it('nao conta entrega futura', () => {
    expect(cargaDoDia(ENTREGAS, '2026-08-01')).toEqual({ quantidade: 0, kg: 0, fardos: 0 })
  })

  it('sem entrega nenhuma a carga e zero', () => {
    expect(cargaDoDia([], '2026-08-04')).toEqual({ quantidade: 0, kg: 0, fardos: 0 })
  })
})
