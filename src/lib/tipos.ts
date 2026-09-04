export type Sku = '250g' | '500g'

/** Peso em kg de cada pacote. Fonte única — nunca escrever 0.25 solto no código. */
export const KG_POR_SKU: Record<Sku, number> = { '250g': 0.25, '500g': 0.5 }

export const SKUS: Sku[] = ['250g', '500g']

export type Canal = 'loja_rondelli' | 'revenda' | 'bar_padaria' | 'hotel' | 'consumidor'

export const ROTULO_CANAL: Record<Canal, string> = {
  loja_rondelli: 'Loja Rondelli',
  revenda: 'Revenda',
  bar_padaria: 'Bar / Padaria',
  hotel: 'Hotel',
  consumidor: 'Consumidor final',
}

export type CondicaoPagamento =
  | 'avista'
  | 'prazo_7'
  | 'prazo_14'
  | 'prazo_28'
  | 'prazo_30'
  | 'prazo_30_60'
  | 'consignado'

export const ROTULO_CONDICAO: Record<CondicaoPagamento, string> = {
  avista: 'À vista',
  prazo_7: '7 dias',
  prazo_14: '14 dias',
  prazo_28: '28 dias',
  prazo_30: '30 dias',
  prazo_30_60: '30/60 dias',
  consignado: 'Consignado',
}

export type StatusPedido = 'aberto' | 'entregue' | 'cancelado'

export type TipoMovConsignado = 'entrega' | 'venda_apurada' | 'retorno'

export interface FaixaPreco {
  id: string
  sku: Sku
  /** Piso da faixa, em kg do pedido inteiro. */
  kgMin: number
  /** Teto da faixa em kg; null = sem teto. */
  kgMax: number | null
  /** Preço do pacote nessa faixa. */
  precoUnit: number
  /** ISO YYYY-MM-DD. */
  vigenteDesde: string
}

export interface ItemPedidoInput {
  sku: Sku
  qtdPacotes: number
}

export interface ItemPrecificado {
  /** null quando o item é de um produto novo, sem SKU legado equivalente. */
  sku: Sku | null
  /** Presente nos itens vindos do banco (pedido_itens.produto_id é NOT NULL); ausente nos literais de teste que só testam o cálculo por SKU. */
  produtoId?: string | null
  qtdPacotes: number
  precoUnit: number
  subtotal: number
  /**
   * Custo congelado no lançamento do pedido. null = produto sem custo cadastrado naquele
   * dia, ou usuário sem permissão de ver custo (a RLS devolve vazio para não-admin).
   * Opcional para os literais de teste que só exercitam preço.
   */
  custoUnit?: number | null
}

/** Produto do catálogo — substitui aos poucos o enum fixo `Sku` (250g/500g). */
export interface Produto {
  id: string
  nome: string
  descricao: string | null
  pesoKg: number
  fotoUrl: string | null
  /** SKU legado (250g/500g) que este produto representa, ou null para produto novo. Usado só para rotular histórico de consignado que ainda não carrega produto_id. */
  skuLegado: Sku | null
  ativo: boolean
  ordem: number
}
