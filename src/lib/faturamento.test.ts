import { describe, expect, it } from 'vitest'
import {
  pendenciasDeFaturamento,
  type EnvioParaFaturar,
  type PedidoParaFaturar,
  type VendaParaFaturar,
} from './faturamento'

const HOJE = '2026-08-27'

function venda(extra: Partial<VendaParaFaturar> = {}): VendaParaFaturar {
  return {
    vendaId: 1,
    documento: '6432',
    dtEmissao: '2026-08-20',
    parceiroNome: 'HOTEL MALIBU',
    clienteId: 'c1',
    valorTotal: 960,
    estado: 'efetivado',
    temTorrado: true,
    nfEstado: null,
    ...extra,
  }
}

function pedido(extra: Partial<PedidoParaFaturar> = {}): PedidoParaFaturar {
  return {
    id: 'p1',
    clienteId: 'c1',
    clienteNome: 'Hotel Malibu',
    data: '2026-08-25',
    totalValor: 230,
    status: 'aberto',
    ...extra,
  }
}

function montar(entrada: {
  vendas?: VendaParaFaturar[]
  envios?: EnvioParaFaturar[]
  pedidos?: PedidoParaFaturar[]
  nomePorUsuario?: Record<string, string>
  criadoPorPedido?: Record<string, string | null>
}) {
  return pendenciasDeFaturamento({
    vendas: entrada.vendas ?? [],
    envios: entrada.envios ?? [],
    pedidos: entrada.pedidos ?? [],
    nomePorUsuario: entrada.nomePorUsuario,
    criadoPorPedido: entrada.criadoPorPedido,
    hoje: HOJE,
  })
}

describe('pendenciasDeFaturamento', () => {
  it('separa os três lugares onde a venda pode parar', () => {
    const resumo = montar({
      vendas: [
        venda({ vendaId: 10, estado: 'rascunho', dtEmissao: '2026-08-24' }),
        venda({ vendaId: 11, estado: 'efetivado', dtEmissao: '2026-04-08' }),
      ],
      envios: [
        { pedidoId: 'p1', vendaId: null, ultimoErro: 'ERP fora do ar' },
        { pedidoId: 'p2', vendaId: 10, ultimoErro: null },
      ],
      pedidos: [pedido(), pedido({ id: 'p2' })],
    })
    // a ordem é pela espera, não pelo estágio — quem classifica cada um é a chave
    const porChave = Object.fromEntries(resumo.pendencias.map((p) => [p.chave, p.estagio]))
    expect(porChave).toEqual({
      'pedido:p1': 'nao_subiu',
      'venda:10': 'rascunho',
      'venda:11': 'sem_nota',
    })
  })

  it('ordena pela espera mais longa — é o que está há mais tempo sem virar dinheiro', () => {
    const resumo = montar({
      vendas: [
        venda({ vendaId: 10, dtEmissao: '2026-08-24' }),
        venda({ vendaId: 11, dtEmissao: '2026-04-08' }),
        venda({ vendaId: 12, dtEmissao: '2026-07-13' }),
      ],
    })
    expect(resumo.pendencias.map((p) => p.vendaId)).toEqual([11, 12, 10])
    expect(resumo.maiorEspera).toBe(141)
  })

  it('soma o que está parado e conta quantos', () => {
    const resumo = montar({
      vendas: [venda({ vendaId: 10, valorTotal: 5100 }), venda({ vendaId: 11, valorTotal: 960 })],
    })
    expect(resumo.total).toBe(2)
    expect(resumo.valorTotal).toBe(6060)
  })

  it('nota autorizada não está esperando nada', () => {
    const resumo = montar({ vendas: [venda({ nfEstado: 'autorizada' })] })
    expect(resumo.pendencias).toEqual([])
  })

  it('venda cancelada e nota cancelada saem da fila', () => {
    const resumo = montar({
      vendas: [venda({ vendaId: 1, estado: 'cancelado' }), venda({ vendaId: 2, nfEstado: 'cancelada' })],
    })
    expect(resumo.pendencias).toEqual([])
  })

  it('nota que não é de café torrado não é desta operação', () => {
    // gado e café verde: o app nem confere o estado da nota deles
    const resumo = montar({ vendas: [venda({ temTorrado: false })] })
    expect(resumo.pendencias).toEqual([])
  })

  it('envio que já subiu não vira pendência de "não subiu" — quem manda é o espelho', () => {
    const resumo = montar({
      envios: [{ pedidoId: 'p1', vendaId: 999, ultimoErro: null }],
      pedidos: [pedido()],
    })
    expect(resumo.pendencias).toEqual([])
  })

  it('pedido cancelado não espera faturamento', () => {
    const resumo = montar({
      envios: [{ pedidoId: 'p1', vendaId: null, ultimoErro: null }],
      pedidos: [pedido({ status: 'cancelado' })],
    })
    expect(resumo.pendencias).toEqual([])
  })

  it('diz quem digitou quando a venda veio do app', () => {
    // é o que prova que a lista é de TODO MUNDO, não só de quem está olhando
    const resumo = montar({
      vendas: [venda({ vendaId: 10, estado: 'rascunho' })],
      envios: [{ pedidoId: 'p1', vendaId: 10, ultimoErro: null }],
      pedidos: [pedido()],
      criadoPorPedido: { p1: 'u9' },
      nomePorUsuario: { u9: 'João Vendedor' },
    })
    expect(resumo.pendencias[0].digitadoPor).toBe('João Vendedor')
  })

  it('venda nascida no ERP não inventa quem digitou', () => {
    const resumo = montar({ vendas: [venda({ vendaId: 10 })] })
    expect(resumo.pendencias[0].digitadoPor).toBe(null)
    expect(resumo.pendencias[0].clienteNome).toBe('HOTEL MALIBU')
  })

  it('o nome do cadastro vence a razão social do ERP quando o pedido é conhecido', () => {
    const resumo = montar({
      vendas: [venda({ vendaId: 10, parceiroNome: 'MALIBU HOTELARIA LTDA' })],
      envios: [{ pedidoId: 'p1', vendaId: 10, ultimoErro: null }],
      pedidos: [pedido()],
    })
    expect(resumo.pendencias[0].clienteNome).toBe('Hotel Malibu')
  })

  it('diz de quando é o retrato do espelho — o mais recente entre as vendas', () => {
    // espelho velho é mentira silenciosa: já ficou 16 horas parado mostrando venda
    // apagada no ERP e escondendo venda criada no mesmo dia
    const resumo = montar({
      vendas: [
        venda({ vendaId: 1, sincronizadoEm: '2026-08-26T21:17:13Z' }),
        venda({ vendaId: 2, sincronizadoEm: '2026-08-27T14:00:00Z' }),
      ],
    })
    expect(resumo.espelhoLidoEm).toBe('2026-08-27T14:00:00Z')
  })

  it('espelho sem carimbo não inventa horário', () => {
    expect(montar({ vendas: [venda()] }).espelhoLidoEm).toBe(null)
  })

  it('leva o erro do envio junto — é o que explica por que não subiu', () => {
    const resumo = montar({
      envios: [{ pedidoId: 'p1', vendaId: null, ultimoErro: 'parceiro sem documento' }],
      pedidos: [pedido()],
    })
    expect(resumo.pendencias[0].ultimoErro).toBe('parceiro sem documento')
  })
})
