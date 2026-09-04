import { describe, expect, it } from 'vitest'
import { arredondar2 } from './numero'
import {
  caixaPrevistoPorSemana,
  prazoMedioDias,
  prazoMedioPonderado,
  vencimentos,
  type PedidoPrazo,
} from './prazo'

describe('vencimentos', () => {
  it('a vista vence no dia do pedido', () => {
    expect(vencimentos('2026-08-03', 'avista', 500)).toEqual([{ data: '2026-08-03', valor: 500 }])
  })

  it('prazo simples soma os dias', () => {
    expect(vencimentos('2026-08-03', 'prazo_28', 500)).toEqual([{ data: '2026-08-31', valor: 500 }])
    expect(vencimentos('2026-08-03', 'prazo_30', 500)).toEqual([{ data: '2026-09-02', valor: 500 }])
  })

  it('30/60 divide em duas parcelas iguais', () => {
    expect(vencimentos('2026-08-03', 'prazo_30_60', 500)).toEqual([
      { data: '2026-09-02', valor: 250 },
      { data: '2026-10-02', valor: 250 },
    ])
  })

  it('30/60 com valor impar nao perde centavo', () => {
    const parcelas = vencimentos('2026-08-03', 'prazo_30_60', 100.01)
    expect(arredondar2(parcelas.reduce((soma, p) => soma + p.valor, 0))).toBe(100.01)
  })

  it('consignado nao gera vencimento', () => {
    expect(vencimentos('2026-08-03', 'consignado', 500)).toEqual([])
  })
})

describe('prazoMedioDias', () => {
  it('devolve os dias da condicao', () => {
    expect(prazoMedioDias('avista')).toBe(0)
    expect(prazoMedioDias('prazo_14')).toBe(14)
  })

  it('30/60 tem prazo medio 45', () => {
    expect(prazoMedioDias('prazo_30_60')).toBe(45)
  })

  it('consignado nao tem prazo', () => {
    expect(prazoMedioDias('consignado')).toBeNull()
  })
})

describe('prazoMedioPonderado', () => {
  const pedidos: PedidoPrazo[] = [
    { data: '2026-08-03', condicao: 'avista', totalValor: 100 },
    { data: '2026-08-03', condicao: 'prazo_30', totalValor: 900 },
  ]

  it('pondera por R$, nao por numero de pedidos', () => {
    // media simples daria 15; ponderada = (100*0 + 900*30) / 1000 = 27
    expect(prazoMedioPonderado(pedidos)).toBe(27)
  })

  it('ignora consignado no calculo', () => {
    expect(
      prazoMedioPonderado([
        ...pedidos,
        { data: '2026-08-03', condicao: 'consignado', totalValor: 5000 },
      ]),
    ).toBe(27)
  })

  it('devolve null quando nao ha pedido com prazo', () => {
    expect(prazoMedioPonderado([])).toBeNull()
    expect(
      prazoMedioPonderado([{ data: '2026-08-03', condicao: 'consignado', totalValor: 100 }]),
    ).toBeNull()
  })
})

describe('caixaPrevistoPorSemana', () => {
  it('joga cada parcela na semana do vencimento', () => {
    const pedidos: PedidoPrazo[] = [
      { data: '2026-08-03', condicao: 'avista', totalValor: 100 },
      { data: '2026-08-03', condicao: 'prazo_30_60', totalValor: 400 },
    ]
    // avista -> 03/08 (semana 03/08); 30d -> 02/09 (semana 31/08); 60d -> 02/10 (semana 28/09)
    expect(caixaPrevistoPorSemana(pedidos)).toEqual([
      { semana: '2026-08-03', valor: 100 },
      { semana: '2026-08-31', valor: 200 },
      { semana: '2026-09-28', valor: 200 },
    ])
  })

  it('soma parcelas da mesma semana e ordena por data', () => {
    expect(
      caixaPrevistoPorSemana([
        { data: '2026-08-05', condicao: 'avista', totalValor: 50 },
        { data: '2026-08-03', condicao: 'avista', totalValor: 70 },
      ]),
    ).toEqual([{ semana: '2026-08-03', valor: 120 }])
  })

  it('consignado fica fora da previsao de caixa', () => {
    expect(
      caixaPrevistoPorSemana([{ data: '2026-08-03', condicao: 'consignado', totalValor: 900 }]),
    ).toEqual([])
  })
})
