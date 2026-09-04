import { describe, expect, it } from 'vitest'
import {
  comissaoDaBase,
  limitesDoMes,
  percentualVigente,
  resumoComissao,
  type BaseComissionavel,
  type RegraComissao,
} from './comissao'

describe('percentualVigente', () => {
  it('sem regra cai no padrao de 2%', () => {
    expect(percentualVigente([], '2026-08-04')).toBe(2)
  })

  it('escolhe a regra mais recente que ja vigia', () => {
    const regras: RegraComissao[] = [
      { percentual: 2, vigenteDesde: '2026-01-01' },
      { percentual: 3, vigenteDesde: '2026-06-01' },
    ]
    expect(percentualVigente(regras, '2026-08-04')).toBe(3)
    expect(percentualVigente(regras, '2026-03-01')).toBe(2)
    expect(percentualVigente(regras, '2025-12-01')).toBe(2) // antes de qualquer regra -> padrao
  })

  it('percentual 0 e respeitado, nao cai no padrao', () => {
    const regras: RegraComissao[] = [{ percentual: 0, vigenteDesde: '2026-01-01' }]
    expect(percentualVigente(regras, '2026-08-04')).toBe(0)
  })
})

describe('comissaoDaBase', () => {
  const regras: RegraComissao[] = [{ percentual: 2, vigenteDesde: '2026-01-01' }]

  it('comissao de base cheia', () => {
    const base: BaseComissionavel = { data: '2026-08-04', valor: 1000, origem: 'pedido' }
    expect(comissaoDaBase(base, regras)).toBe(20)
  })

  it('base com desconto gera comissao menor que a de base cheia', () => {
    const cheia: BaseComissionavel = { data: '2026-08-04', valor: 1000, origem: 'pedido' }
    const comDesconto: BaseComissionavel = { data: '2026-08-04', valor: 800, origem: 'pedido' }
    expect(comissaoDaBase(comDesconto, regras)).toBeLessThan(comissaoDaBase(cheia, regras))
  })

  it('percentual 0 gera comissao 0, nao cai no padrao', () => {
    const base: BaseComissionavel = { data: '2026-08-04', valor: 1000, origem: 'pedido' }
    expect(comissaoDaBase(base, [{ percentual: 0, vigenteDesde: '2026-01-01' }])).toBe(0)
  })
})

describe('resumoComissao', () => {
  it('soma pedido e consignado separadamente em porOrigem', () => {
    const regras: RegraComissao[] = [{ percentual: 2, vigenteDesde: '2026-01-01' }]
    const bases: BaseComissionavel[] = [
      { data: '2026-08-01', valor: 1000, origem: 'pedido' },
      { data: '2026-08-02', valor: 500, origem: 'pedido' },
      { data: '2026-08-03', valor: 300, origem: 'consignado' },
    ]
    const resumo = resumoComissao(bases, regras)
    expect(resumo.porOrigem.pedido).toEqual({ base: 1500, comissao: 30 })
    expect(resumo.porOrigem.consignado).toEqual({ base: 300, comissao: 6 })
    expect(resumo.baseTotal).toBe(1800)
    expect(resumo.comissaoTotal).toBe(36)
    expect(resumo.quantidade).toBe(3)
  })
})

describe('limitesDoMes', () => {
  it('mes de 31 dias', () => {
    expect(limitesDoMes('2026-08-04')).toEqual({ inicio: '2026-08-01', fim: '2026-08-31' })
  })

  it('mes de 30 dias', () => {
    expect(limitesDoMes('2026-04-15')).toEqual({ inicio: '2026-04-01', fim: '2026-04-30' })
  })

  it('fevereiro em ano bissexto', () => {
    expect(limitesDoMes('2028-02-10')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' })
  })

  it('fevereiro em ano nao bissexto', () => {
    expect(limitesDoMes('2026-02-10')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
  })
})
