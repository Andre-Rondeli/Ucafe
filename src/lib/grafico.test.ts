import { describe, expect, it } from 'vitest'
import { escalaBonita, indicesComData } from './grafico'

describe('escalaBonita', () => {
  it('arredonda o teto para um número que serve de régua', () => {
    // 39 era o teto cru do gráfico da Loja 117 — marca quebrada, ninguém mede contra ela
    const { teto, marcas } = escalaBonita(39)
    expect(teto).toBe(40)
    expect(marcas).toEqual([0, 20, 40])
  })

  it('nunca corta a série: o teto é sempre >= o maior valor', () => {
    for (const max of [1, 7, 13, 39, 41, 99, 101, 250, 999, 1234]) {
      const { teto } = escalaBonita(max)
      expect(teto, `teto de ${max}`).toBeGreaterThanOrEqual(max)
    }
  })

  it('todas as marcas são redondas — sem 7,500000000000001', () => {
    for (const max of [3, 9, 39, 240, 1234]) {
      for (const m of escalaBonita(max).marcas) {
        expect(String(m), `marca de ${max}`).not.toMatch(/\.\d{4,}/)
      }
    }
  })

  it('a primeira marca é zero e a última é o teto', () => {
    const { teto, marcas } = escalaBonita(593)
    expect(marcas[0]).toBe(0)
    expect(marcas[marcas.length - 1]).toBe(teto)
  })

  it('série sem venda nenhuma não quebra a escala', () => {
    expect(escalaBonita(0)).toEqual({ teto: 1, marcas: [0, 1] })
    expect(escalaBonita(Number.NaN).teto).toBe(1)
  })
})

describe('indicesComData', () => {
  it('marca o primeiro e o último dia — é o período que o desenho cobre', () => {
    const i = indicesComData(45)
    expect(i[0]).toBe(0)
    expect(i[i.length - 1]).toBe(44)
  })

  // Duas datas coladas são pior que uma a menos.
  it('não deixa uma marca do meio encostar na do fim', () => {
    for (const total of [15, 16, 17, 18, 22, 29, 30, 45, 46]) {
      const i = indicesComData(total)
      const ultimo = i[i.length - 1]
      const penultimo = i[i.length - 2]
      expect(ultimo - penultimo, `total ${total}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('série curta rotula todos os dias que tem', () => {
    expect(indicesComData(1)).toEqual([0])
    expect(indicesComData(2)).toEqual([0, 1])
  })

  it('série vazia não devolve marca', () => {
    expect(indicesComData(0)).toEqual([])
  })
})
