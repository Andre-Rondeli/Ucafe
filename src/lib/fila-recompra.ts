import type { LinhaCliente } from './insights.ts'
import type { Confianca, EstoqueNoCliente, OrigemCadencia } from './recompra.ts'

/** O que o app sabe do cadastro e o relatório precisa para agir sem sair da tela. */
export interface ClienteDaFila {
  id: string
  nome: string
  cidade: string | null
  whatsapp: string | null
  ativo: boolean
}

/** Uma linha do relatório: quem é, há quanto tempo devia ter comprado e o que oferecer. */
export interface ItemFila {
  clienteId: string
  clienteNome: string
  cidade: string | null
  whatsapp: string | null
  /** Positivo = passou da data prevista. Zero = vence hoje. Negativo = ainda vai vencer. */
  atrasoDias: number
  cadenciaDias: number | null
  origemCadencia: OrigemCadencia
  proximaCompraPrevista: string | null
  /** Média das últimas compras — é o quanto sugerir na ligação. */
  sugestaoKg: number | null
  ultimaCompra: string
  kgUltimo: number
  confianca: Confianca
  estoque: EstoqueNoCliente | null
}

export interface Fila {
  /** Já passou da data. É a lista que o aviso das 9h conta. */
  vencidos: ItemFila[]
  /** Vence hoje ou nos próximos dias — a ligação que evita o atraso. */
  aVencer: ItemFila[]
  /** Compraram, mas não há cadência para prever nada. Aparecem como recado, não como fila. */
  semPrevisao: { clienteId: string; clienteNome: string; ultimaCompra: string }[]
}

/** Mesma antecedência do sinal `na_hora`: três dias é o que dá para preparar a visita. */
export const DIAS_DE_ANTECEDENCIA = 3

/**
 * O relatório de quem está na hora de recomprar.
 *
 * A régua é a MESMA do aviso das 9h (`atrasoDias > 0` sobre pedido do app + nota do ERP):
 * o número da notificação e o número desta tela têm de bater, senão quem abre o aviso vai
 * conferir cliente por cliente para descobrir qual é a lista de verdade — que é
 * exatamente o trabalho que o aviso existe para poupar.
 *
 * Cliente inativo fica de fora: não
 * há ninguém para ligar, e uma linha sem telefone no topo da fila só empurra as de verdade
 * para baixo.
 */
export function montarFila(
  linhas: LinhaCliente[],
  clientes: ClienteDaFila[],
  opcoes: { diasDeAntecedencia?: number } = {},
): Fila {
  const antecedencia = opcoes.diasDeAntecedencia ?? DIAS_DE_ANTECEDENCIA
  const porId = new Map(clientes.filter((cliente) => cliente.ativo).map((c) => [c.id, c]))

  const fila: Fila = { vencidos: [], aVencer: [], semPrevisao: [] }

  for (const linha of linhas) {
    const cliente = porId.get(linha.clienteId)
    if (!cliente) continue

    if (linha.previsao.atrasoDias === null) {
      fila.semPrevisao.push({
        clienteId: linha.clienteId,
        clienteNome: cliente.nome,
        ultimaCompra: linha.ultimaCompra,
      })
      continue
    }

    const item: ItemFila = {
      clienteId: linha.clienteId,
      // o nome do cadastro manda: o histórico carrega o nome do dia da venda, e o do ERP
      // vem em razão social — quem lê a fila procura pelo nome que usa
      clienteNome: cliente.nome,
      cidade: cliente.cidade,
      whatsapp: cliente.whatsapp,
      atrasoDias: linha.previsao.atrasoDias,
      cadenciaDias: linha.previsao.cadenciaDias,
      origemCadencia: linha.previsao.origemCadencia,
      proximaCompraPrevista: linha.previsao.proximaCompraPrevista,
      sugestaoKg: linha.previsao.qtdSugeridaKg,
      ultimaCompra: linha.ultimaCompra,
      kgUltimo: linha.kgUltimo,
      confianca: linha.previsao.confianca,
      estoque: linha.estoque,
    }

    if (item.atrasoDias > 0) fila.vencidos.push(item)
    else if (item.atrasoDias >= -antecedencia) fila.aVencer.push(item)
  }

  fila.vencidos.sort((a, b) => b.atrasoDias - a.atrasoDias || a.clienteNome.localeCompare(b.clienteNome))
  fila.aVencer.sort((a, b) => b.atrasoDias - a.atrasoDias || a.clienteNome.localeCompare(b.clienteNome))
  fila.semPrevisao.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome))
  return fila
}

/** Só dígitos — é o formato que o wa.me aceita. */
export function limparWhatsapp(numero: string): string {
  return numero.replace(/\D/g, '')
}
