import { describe, expect, it } from 'vitest'
import { custoPorKgUnico, margemDoPeriodo, margemDosItens } from './margem'

describe('margemDosItens', () => {
  it('calcula custo, margem e percentual quando todo item tem custo', () => {
    const m = margemDosItens([
      { qtdPacotes: 20, subtotal: 200, custoUnit: 7.5 },
      { qtdPacotes: 10, subtotal: 180, custoUnit: 12 },
    ])
    expect(m.receita).toBe(380)
    expect(m.custo).toBe(270)
    expect(m.margem).toBe(110)
    expect(m.margemPercentual).toBe(28.95)
    expect(m.completa).toBe(true)
  })

  it('item sem custo deixa a margem indefinida em vez de inventar zero', () => {
    const m = margemDosItens([
      { qtdPacotes: 20, subtotal: 200, custoUnit: 7.5 },
      { qtdPacotes: 10, subtotal: 180, custoUnit: null },
    ])
    expect(m.receita).toBe(380)
    expect(m.custo).toBe(150)
    expect(m.margem).toBeNull()
    expect(m.margemPercentual).toBeNull()
    expect(m.completa).toBe(false)
  })

  it('lista vazia nao e margem zero: e margem desconhecida', () => {
    const m = margemDosItens([])
    expect(m.receita).toBe(0)
    expect(m.custo).toBe(0)
    expect(m.margem).toBeNull()
    expect(m.completa).toBe(false)
  })

  it('custo zero legitimo conta como custo informado (brinde, amostra)', () => {
    const m = margemDosItens([{ qtdPacotes: 5, subtotal: 100, custoUnit: 0 }])
    expect(m.custo).toBe(0)
    expect(m.margem).toBe(100)
    expect(m.margemPercentual).toBe(100)
    expect(m.completa).toBe(true)
  })

  it('receita zero nao divide por zero', () => {
    const m = margemDosItens([{ qtdPacotes: 1, subtotal: 0, custoUnit: 0 }])
    expect(m.margem).toBe(0)
    expect(m.margemPercentual).toBeNull()
  })

  it('margem negativa aparece negativa -- vender abaixo do custo nao se esconde', () => {
    const m = margemDosItens([{ qtdPacotes: 10, subtotal: 50, custoUnit: 8 }])
    expect(m.custo).toBe(80)
    expect(m.margem).toBe(-30)
    expect(m.margemPercentual).toBe(-60)
  })

  it('custo ausente (campo nao vindo do banco) conta igual a null', () => {
    const m = margemDosItens([{ qtdPacotes: 10, subtotal: 100 }])
    expect(m.custo).toBe(0)
    expect(m.margem).toBeNull()
    expect(m.completa).toBe(false)
  })

  it('nao acumula erro de ponto flutuante', () => {
    const m = margemDosItens([{ qtdPacotes: 3, subtotal: 30, custoUnit: 0.1 }])
    expect(m.custo).toBe(0.3)
  })
})

describe('margemDoPeriodo', () => {
  it('soma os pedidos e fica incompleta se qualquer item nao tiver custo', () => {
    const m = margemDoPeriodo([
      { itens: [{ qtdPacotes: 20, subtotal: 200, custoUnit: 7.5 }] },
      { itens: [{ qtdPacotes: 10, subtotal: 100, custoUnit: null }] },
    ])
    expect(m.receita).toBe(300)
    expect(m.custo).toBe(150)
    expect(m.completa).toBe(false)
    expect(m.margem).toBeNull()
  })

  it('periodo todo com custo devolve margem', () => {
    const m = margemDoPeriodo([
      { itens: [{ qtdPacotes: 20, subtotal: 200, custoUnit: 5 }] },
      { itens: [{ qtdPacotes: 10, subtotal: 100, custoUnit: 5 }] },
    ])
    expect(m.receita).toBe(300)
    expect(m.custo).toBe(150)
    expect(m.margem).toBe(150)
    expect(m.margemPercentual).toBe(50)
  })

  it('periodo sem pedido nenhum e margem desconhecida', () => {
    expect(margemDoPeriodo([]).completa).toBe(false)
  })
})

describe('custoPorKgUnico', () => {
  it('devolve o custo por kg quando ele é o mesmo nos dois produtos', () => {
    // é o caso real: 250g a R$ 6,50 e 500g a R$ 13,00 dão R$ 26,00/kg nos dois
    expect(
      custoPorKgUnico([
        { pesoKg: 0.25, custoUnit: 6.5 },
        { pesoKg: 0.5, custoUnit: 13 },
      ]),
    ).toBe(26)
  })

  it('RECUSA quando os custos por kg divergem — margem chutada é pior que margem nenhuma', () => {
    expect(
      custoPorKgUnico([
        { pesoKg: 0.25, custoUnit: 6.5 },
        { pesoKg: 0.5, custoUnit: 14 },
      ]),
    ).toBeNull()
  })

  it('ignora produto sem custo, e devolve null quando nenhum tem', () => {
    expect(custoPorKgUnico([{ pesoKg: 0.25, custoUnit: 6.5 }, { pesoKg: 0.5, custoUnit: null }])).toBe(26)
    expect(custoPorKgUnico([{ pesoKg: 0.25, custoUnit: null }])).toBeNull()
    expect(custoPorKgUnico([])).toBeNull()
  })

  it('custo zero é custo informado (brinde), não ausência', () => {
    expect(custoPorKgUnico([{ pesoKg: 0.25, custoUnit: 0 }])).toBe(0)
  })
})
