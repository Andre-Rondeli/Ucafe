// Regras da sincronia com o ProcessDesk — a parte que decide, separada da parte que
// conversa com a rede. Vive aqui, e não dentro da Edge Function, porque é isto que os
// testes precisam alcançar: a fusão, a janela e a trava de completude são onde o erro
// seria silencioso.
//
// Doc: docs/ESPELHO-REDE-TECNICO.md

/** Uma linha de venda como o ProcessDesk devolve. */
export type VendaDoFeed = {
  dia: string
  loja_codigo: string
  loja_nome: string | null
  loja_tipo: string | null
  uf: string | null
  produto_codigo: string
  produto_nome: string | null
  qtd: number | string | null
  valor: number | string | null
}

/** Uma linha de estoque como o ProcessDesk devolve. */
export type EstoqueDoFeed = {
  dia: string
  loja_codigo: string
  loja_nome: string | null
  loja_tipo: string | null
  uf: string | null
  produto_codigo: string
  produto_nome: string | null
  estoque_qtd: number | string | null
}

/** Uma linha de rede_dia, pronta para upsert. */
export type LinhaDaRede = {
  dia: string
  loja_codigo: string
  produto_codigo: string
  loja_nome: string | null
  loja_tipo: string | null
  uf: string | null
  produto_nome: string | null
  venda_qtd: number | null
  venda_valor: number | null
  estoque_qtd: number | null
}

const chave = (dia: string, loja: string, produto: string) => `${dia}|${loja}|${produto}`

/** numeric do Postgres chega como string no JSON. null continua null — não vira 0. */
function numero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Funde as duas listas do feed numa linha por dia × loja × produto.
 *
 * Precisa ser fusão, e não dois upserts em sequência: gravar a venda com estoque ausente
 * escreveria `estoque_qtd = null` por cima do estoque que o outro upsert acabou de gravar.
 * O apagamento seria silencioso — a linha existe, o número some.
 *
 * Dia que só tem venda fica com estoque nulo de verdade (a foto de estoque começa depois
 * da série de venda), e é isso que a tela precisa distinguir de "estoque zero".
 */
export function fundirFeed(vendas: VendaDoFeed[], estoques: EstoqueDoFeed[]): LinhaDaRede[] {
  const mapa = new Map<string, LinhaDaRede>()

  const garantir = (
    dia: string,
    loja: string,
    produto: string,
    rotulos: { loja_nome: string | null; loja_tipo: string | null; uf: string | null; produto_nome: string | null },
  ): LinhaDaRede => {
    const k = chave(dia, loja, produto)
    const existente = mapa.get(k)
    if (existente) {
      // rótulo só é preenchido, nunca sobrescrito por vazio: se a venda trouxe o nome da
      // loja e o estoque veio sem, o nome fica.
      existente.loja_nome ??= rotulos.loja_nome
      existente.loja_tipo ??= rotulos.loja_tipo
      existente.uf ??= rotulos.uf
      existente.produto_nome ??= rotulos.produto_nome
      return existente
    }
    const nova: LinhaDaRede = {
      dia,
      loja_codigo: loja,
      produto_codigo: produto,
      ...rotulos,
      venda_qtd: null,
      venda_valor: null,
      estoque_qtd: null,
    }
    mapa.set(k, nova)
    return nova
  }

  for (const v of vendas) {
    const linha = garantir(v.dia, v.loja_codigo, v.produto_codigo, {
      loja_nome: v.loja_nome ?? null,
      loja_tipo: v.loja_tipo ?? null,
      uf: v.uf ?? null,
      produto_nome: v.produto_nome ?? null,
    })
    linha.venda_qtd = numero(v.qtd)
    linha.venda_valor = numero(v.valor)
  }

  for (const e of estoques) {
    const linha = garantir(e.dia, e.loja_codigo, e.produto_codigo, {
      loja_nome: e.loja_nome ?? null,
      loja_tipo: e.loja_tipo ?? null,
      uf: e.uf ?? null,
      produto_nome: e.produto_nome ?? null,
    })
    linha.estoque_qtd = numero(e.estoque_qtd)
  }

  return [...mapa.values()]
}

/** Quantos dias o pedido recua além do último dia já espelhado. */
export const DIAS_DE_SOBREPOSICAO = 3

/**
 * Primeiro dia a buscar na primeira sincronização (depois disso manda o watermark).
 * Ponha uma data ANTERIOR ao seu primeiro dia de venda na rede: data cedo demais só traz
 * vazio; data tarde demais deixa histórico para trás sem avisar.
 */
export const PRIMEIRO_DIA = '2026-05-01'

/**
 * De que dia pedir o feed.
 *
 * Recua 3 dias além do último dia espelhado, e não 0, porque o Consinco reenvia sempre os
 * últimos dias e se autocorrige — carga parcial de ontem vira carga cheia depois de
 * amanhã. Pedir só do último dia congelaria o número parcial para sempre, sem erro
 * nenhum: a linha existiria, com o valor errado.
 */
export function calcularDesde(ultimoDiaEspelhado: string | null): string {
  if (!ultimoDiaEspelhado) return PRIMEIRO_DIA
  const d = new Date(`${ultimoDiaEspelhado}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return PRIMEIRO_DIA
  d.setUTCDate(d.getUTCDate() - DIAS_DE_SOBREPOSICAO)
  const recuado = d.toISOString().slice(0, 10)
  return recuado < PRIMEIRO_DIA ? PRIMEIRO_DIA : recuado
}

export type VeredictoDeGravacao =
  | { grava: true }
  | { grava: false; motivo: string }

/**
 * Trava de completude.
 *
 * Origem vazia NÃO é o mesmo que origem encolhida. Se o ProcessDesk responder sem nenhuma
 * venda — pipeline parado, filtro que mudou, produto que perdeu o vínculo com a indústria
 * — e o espelho já tiver histórico, gravar por cima seria trocar dado bom por nada, com o
 * cron marcando verde.
 *
 * Espelho ainda vazio é o caso legítimo de primeira carga: aí sim aceita qualquer coisa,
 * inclusive nada.
 */
export function decidirSeGrava(
  linhasRecebidas: number,
  linhasJaNoEspelho: number,
): VeredictoDeGravacao {
  if (linhasRecebidas > 0) return { grava: true }
  if (linhasJaNoEspelho === 0) return { grava: true }
  return {
    grava: false,
    motivo:
      `O ProcessDesk respondeu sem nenhuma linha, mas o espelho já tem ${linhasJaNoEspelho}. ` +
      'Nada foi gravado: origem vazia não é o mesmo que "não vendeu".',
  }
}

// ---------------------------------------------------------------------------
// Leitura: o que a tela "Nas lojas" mostra.
// ---------------------------------------------------------------------------

/** Uma linha de rede_dia como ela sai do banco. */
export type LinhaEspelho = {
  dia: string
  loja_codigo: string
  loja_nome: string | null
  loja_tipo: string | null
  uf: string | null
  produto_codigo: string
  produto_nome: string | null
  venda_qtd: number | null
  venda_valor: number | null
  estoque_qtd: number | null
}

/** O detalhe que aparece quando se abre uma loja. */
export type ResumoDeProduto = {
  produtoCodigo: string
  produtoNome: string | null
  vendaQtd: number
  vendaValor: number
  /** Venda média diária na janela — a VMD. */
  vmd: number
  estoqueQtd: number | null
  diaDoEstoque: string | null
  coberturaDias: number | null
}

export type ResumoDeLoja = {
  lojaCodigo: string
  lojaNome: string | null
  lojaTipo: string | null
  uf: string | null
  vendaQtd: number
  vendaValor: number
  /** Venda média diária na janela — a VMD. */
  vmd: number
  estoqueQtd: number | null
  diaDoEstoque: string | null
  /** Para quantos dias o estoque dá, no ritmo da janela. null quando não dá para dizer. */
  coberturaDias: number | null
  ultimoDiaComVenda: string | null
  produtos: ResumoDeProduto[]
}

/** O grupo de cima: a rede inteira. */
export type ResumoDaRede = {
  vendaQtd: number
  vendaValor: number
  vmd: number
  estoqueQtd: number | null
  coberturaDias: number | null
  lojas: number
  apertadas: number
}

/** Janela de leitura da tela: os últimos 30 dias. */
export const JANELA_DIAS = 30

/** Abaixo disto a loja fica sem café antes da próxima visita semanal. */
export const COBERTURA_CURTA = 7

function diaSeguinte(dia: string): string {
  const d = new Date(dia + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function diaMenos(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/** Dias corridos entre duas datas ISO, incluindo as duas pontas. */
function diasEntreInclusive(inicio: string, fim: string): number {
  const MS_DIA = 86_400_000
  const de = new Date(`${inicio}T00:00:00Z`).getTime()
  const ate = new Date(`${fim}T00:00:00Z`).getTime()
  return Math.round((ate - de) / MS_DIA) + 1
}

/**
 * Venda média diária no período — a VMD.
 *
 * Divide por dias CORRIDOS do período, não por dias com venda. É a mesma régua da
 * cobertura logo abaixo: se fossem denominadores diferentes, "VMD 5/dia" e "dá para 60
 * dias" contariam histórias que não fecham entre si na mesma linha da tela.
 */
function vmdDaJanela(vendaNoPeriodo: number, duracaoDias: number): number {
  return vendaNoPeriodo / duracaoDias
}

/** Cobertura em dias, ou null quando não houve venda para dar ritmo. */
function cobertura(estoque: number | null, vendaNoPeriodo: number, duracaoDias: number): number | null {
  if (estoque === null) return null
  const mediaDiaria = vendaNoPeriodo / duracaoDias
  // Sem venda no período não existe ritmo, e dividir por zero daria Infinity — que a tela
  // mostraria como "∞ dias", lido como "sobra muito" quando o certo é "não sei".
  return mediaDiaria > 0 ? Math.round(estoque / mediaDiaria) : null
}

/**
 * O último dia que realmente tem venda no espelho.
 *
 * A janela é ancorada AQUI, e não no relógio de hoje: se a carga do Consinco atrasar, um
 * "últimos 30 dias até hoje" incluiria dias sem dado e faria a venda parecer ter caído.
 * Queda por atraso de carga é a queda mais fácil de confundir com queda de verdade.
 */
export function ancoraDaJanela(linhas: LinhaEspelho[]): string | null {
  let maior: string | null = null
  for (const l of linhas) {
    if (l.venda_qtd === null) continue
    if (maior === null || l.dia > maior) maior = l.dia
  }
  return maior
}

type Acumulador = {
  vendaQtd: number
  vendaValor: number
  foto: { dia: string; qtd: number } | null
}

function acumularFoto(alvo: Acumulador, dia: string, qtd: number) {
  // Estoque é FOTO: vale a mais recente. Somar dias diferentes contaria o mesmo café
  // várias vezes; o mesmo dia com outro produto, sim, soma.
  if (!alvo.foto || dia > alvo.foto.dia) alvo.foto = { dia, qtd }
  else if (dia === alvo.foto.dia) alvo.foto.qtd += qtd
}

/**
 * Agrupa o espelho por loja e, dentro dela, por produto.
 *
 * Sem `periodo`, olha os últimos `JANELA_DIAS` dias ancorados no último dia com venda
 * (comportamento de sempre). Com `periodo`, olha exatamente aquele intervalo — é o que a
 * tela usa quando a pessoa escolhe um mês ou uma data específica para olhar. `linhas`
 * precisa já vir filtrada para esse intervalo (é a consulta ao banco que faz esse corte);
 * aqui só se calcula a duração certa para a VMD e a cobertura não mentirem.
 *
 * Ordena por número da loja — loja é sempre número aqui, e ordenar por texto colocaria a
 * 10 antes da 5.
 */
export function resumirPorLoja(
  linhas: LinhaEspelho[],
  periodo?: { inicio: string; fim: string },
): ResumoDeLoja[] {
  const ancora = periodo ? periodo.fim : ancoraDaJanela(linhas)
  const inicio = periodo ? periodo.inicio : ancora ? diaMenos(ancora, JANELA_DIAS - 1) : null
  const duracao = periodo ? diasEntreInclusive(periodo.inicio, periodo.fim) : JANELA_DIAS

  const porLoja = new Map<string, ResumoDeLoja>()
  const acLoja = new Map<string, Acumulador>()
  const acProduto = new Map<string, Acumulador & { nome: string | null }>()

  for (const l of linhas) {
    let r = porLoja.get(l.loja_codigo)
    if (!r) {
      r = {
        lojaCodigo: l.loja_codigo,
        lojaNome: l.loja_nome,
        lojaTipo: l.loja_tipo,
        uf: l.uf,
        vendaQtd: 0,
        vendaValor: 0,
        vmd: 0,
        estoqueQtd: null,
        diaDoEstoque: null,
        coberturaDias: null,
        ultimoDiaComVenda: null,
        produtos: [],
      }
      porLoja.set(l.loja_codigo, r)
      acLoja.set(l.loja_codigo, { vendaQtd: 0, vendaValor: 0, foto: null })
    }
    r.lojaNome ??= l.loja_nome
    r.lojaTipo ??= l.loja_tipo
    r.uf ??= l.uf

    const chaveProduto = `${l.loja_codigo}|${l.produto_codigo}`
    let ap = acProduto.get(chaveProduto)
    if (!ap) {
      ap = { vendaQtd: 0, vendaValor: 0, foto: null, nome: l.produto_nome }
      acProduto.set(chaveProduto, ap)
    }
    ap.nome ??= l.produto_nome

    const al = acLoja.get(l.loja_codigo)!

    if (l.venda_qtd !== null) {
      if (r.ultimoDiaComVenda === null || l.dia > r.ultimoDiaComVenda) r.ultimoDiaComVenda = l.dia
      if (inicio && l.dia >= inicio) {
        al.vendaQtd += l.venda_qtd
        al.vendaValor += l.venda_valor ?? 0
        ap.vendaQtd += l.venda_qtd
        ap.vendaValor += l.venda_valor ?? 0
      }
    }

    if (l.estoque_qtd !== null) {
      acumularFoto(al, l.dia, l.estoque_qtd)
      acumularFoto(ap, l.dia, l.estoque_qtd)
    }
  }

  for (const [codigo, r] of porLoja) {
    const al = acLoja.get(codigo)!
    r.vendaQtd = al.vendaQtd
    r.vendaValor = al.vendaValor
    r.vmd = vmdDaJanela(al.vendaQtd, duracao)
    r.estoqueQtd = al.foto?.qtd ?? null
    r.diaDoEstoque = al.foto?.dia ?? null
    r.coberturaDias = cobertura(r.estoqueQtd, r.vendaQtd, duracao)
  }

  for (const [chaveDoProduto, ap] of acProduto) {
    const [codigoLoja, codigoProduto] = chaveDoProduto.split('|')
    const r = porLoja.get(codigoLoja)
    if (!r) continue
    r.produtos.push({
      produtoCodigo: codigoProduto,
      produtoNome: ap.nome,
      vendaQtd: ap.vendaQtd,
      vendaValor: ap.vendaValor,
      vmd: vmdDaJanela(ap.vendaQtd, duracao),
      estoqueQtd: ap.foto?.qtd ?? null,
      diaDoEstoque: ap.foto?.dia ?? null,
      coberturaDias: cobertura(ap.foto?.qtd ?? null, ap.vendaQtd, duracao),
    })
  }

  for (const r of porLoja.values()) {
    r.produtos.sort((a, b) => a.produtoCodigo.localeCompare(b.produtoCodigo, 'pt-BR'))
  }

  return [...porLoja.values()].sort((a, b) => {
    const na = Number(a.lojaCodigo)
    const nb = Number(b.lojaCodigo)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    return a.lojaCodigo.localeCompare(b.lojaCodigo, 'pt-BR')
  })
}

/**
 * O total da rede.
 *
 * Recebe já filtrado por quem soma: CD **não** entra, porque a saída dele é abastecimento
 * de loja, e somá-lo com a venda da loja contaria o mesmo café duas vezes. O CD não some
 * da tela — aparece em seção própria, com a razão escrita.
 *
 * `duracaoDias` precisa ser a MESMA duração usada em `resumirPorLoja` para montar
 * `lojas` — é o que faz a VMD e a cobertura daqui baterem com a soma das lojas
 * individuais. Default `JANELA_DIAS`, para casar com o uso sem período customizado.
 */
export function resumirRede(lojas: ResumoDeLoja[], duracaoDias: number = JANELA_DIAS): ResumoDaRede {
  let vendaQtd = 0
  let vendaValor = 0
  let estoqueQtd: number | null = null
  let apertadas = 0

  for (const l of lojas) {
    vendaQtd += l.vendaQtd
    vendaValor += l.vendaValor
    if (l.estoqueQtd !== null) estoqueQtd = (estoqueQtd ?? 0) + l.estoqueQtd
    if (l.coberturaDias !== null && l.coberturaDias < COBERTURA_CURTA) apertadas += 1
  }

  return {
    vendaQtd,
    vendaValor,
    vmd: vmdDaJanela(vendaQtd, duracaoDias),
    estoqueQtd,
    coberturaDias: cobertura(estoqueQtd, vendaQtd, duracaoDias),
    lojas: lojas.length,
    apertadas,
  }
}

/** CD e fábrica não são ponto de venda: a saída deles é abastecimento, não consumidor. */
export function ehPontoDeVenda(lojaTipo: string | null): boolean {
  return lojaTipo !== 'cd'
}

/** Um ponto do gráfico "Estoque × venda por dia". */
export type PontoDaSerie = {
  dia: string
  vendaQtd: number | null
  estoqueQtd: number | null
}

export type SerieDaLoja = {
  pontos: PontoDaSerie[]
  /** VMD da própria série, para desenhar o limite de cobertura. */
  vmd: number
  /** Estoque acima disto é excesso: mais de LIMITE_COBERTURA_DIAS de venda parada. */
  limiteEstoque: number | null
  diasSemFoto: number
}

/** O corte que pinta o estoque como excesso — mesma leitura da Ficha 360. */
export const LIMITE_COBERTURA_DIAS = 30

/**
 * A série diária de uma loja (opcionalmente de um produto só), para o gráfico.
 *
 * Devolve um ponto por dia CORRIDO, inclusive os dias sem nada: buraco na série desenhado
 * como se não existisse encurta o eixo e faz uma queda parecer um platô. Dia sem foto de
 * estoque fica `null` — a linha some ali em vez de ligar dois pontos distantes fingindo
 * que o estoque andou em linha reta entre eles.
 */
export function serieDaLoja(
  linhas: LinhaEspelho[],
  lojaCodigo: string,
  produtoCodigo?: string,
): SerieDaLoja {
  const doEscopo = linhas.filter(
    (l) => l.loja_codigo === lojaCodigo && (!produtoCodigo || l.produto_codigo === produtoCodigo),
  )
  if (doEscopo.length === 0) {
    return { pontos: [], vmd: 0, limiteEstoque: null, diasSemFoto: 0 }
  }

  const porDia = new Map<string, { venda: number | null; estoque: number | null }>()
  for (const l of doEscopo) {
    const atual = porDia.get(l.dia) ?? { venda: null, estoque: null }
    if (l.venda_qtd !== null) atual.venda = (atual.venda ?? 0) + l.venda_qtd
    // produtos diferentes no mesmo dia somam; é a foto da loja naquele dia
    if (l.estoque_qtd !== null) atual.estoque = (atual.estoque ?? 0) + l.estoque_qtd
    porDia.set(l.dia, atual)
  }

  const dias = [...porDia.keys()].sort()
  const primeiro = dias[0]
  const ultimo = dias[dias.length - 1]

  const pontos: PontoDaSerie[] = []
  let diasSemFoto = 0
  for (let d = primeiro; d <= ultimo; d = diaSeguinte(d)) {
    const v = porDia.get(d)
    pontos.push({ dia: d, vendaQtd: v?.venda ?? null, estoqueQtd: v?.estoque ?? null })
    if (!v || v.estoque === null) diasSemFoto += 1
  }

  // VMD da série inteira desenhada, e não da janela de 30: o limite tem de bater com o
  // que os olhos veem no gráfico, não com um recorte que não está ali.
  const vendaTotal = pontos.reduce((s, p) => s + (p.vendaQtd ?? 0), 0)
  const vmd = pontos.length > 0 ? vendaTotal / pontos.length : 0

  return {
    pontos,
    vmd,
    limiteEstoque: vmd > 0 ? vmd * LIMITE_COBERTURA_DIAS : null,
    diasSemFoto,
  }
}
