import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import { GraficoEstoqueVenda } from '@/componentes/GraficoEstoqueVenda'
import { useRede, useSincronizarRede } from '@/hooks/useRede'
import { dataLonga, diasTexto, numeroTexto, reais } from '@/lib/formato'
import {
  COBERTURA_CURTA,
  ehPontoDeVenda,
  JANELA_DIAS,
  resumirRede,
  serieDaLoja,
  type LinhaEspelho,
  type ResumoDeLoja,
  type ResumoDeProduto,
} from '@/lib/rede'

/** VMD com uma casa: "4,7/dia". Inteiro sai sem a casa, para não poluir ("5/dia"). */
function vmdTexto(vmd: number): string {
  const arredondado = Math.round(vmd * 10) / 10
  return `${arredondado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia`
}

function textoCobertura(dias: number | null) {
  // Sem venda na janela não há ritmo para dividir. Dizer "0 dias" ou "∞" seria inventar.
  if (dias === null) return { texto: 'sem venda no período', curta: false }
  return { texto: `dá para ${diasTexto(dias)}`, curta: dias < COBERTURA_CURTA }
}

function Numeros({
  vendaQtd,
  vendaValor,
  vmd,
  estoqueQtd,
  diaDoEstoque,
  coberturaDias,
}: {
  vendaQtd: number
  vendaValor: number
  vmd: number
  estoqueQtd: number | null
  diaDoEstoque: string | null
  coberturaDias: number | null
}) {
  const cob = textoCobertura(coberturaDias)
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div>
        <p className="text-xs text-stone-600">Vendeu</p>
        <p className="font-semibold tabular-nums">{numeroTexto(vendaQtd)}</p>
        <p className="text-xs text-stone-600">{reais(vendaValor)}</p>
        <p className="text-xs text-stone-600">VMD {vmdTexto(vmd)}</p>
      </div>
      <div>
        <p className="text-xs text-stone-600">Em estoque</p>
        <p className="font-semibold tabular-nums">
          {estoqueQtd === null ? '—' : numeroTexto(estoqueQtd)}
        </p>
        {diaDoEstoque && <p className="text-xs text-stone-600">de {dataLonga(diaDoEstoque)}</p>}
      </div>
      <div>
        <p className="text-xs text-stone-600">Cobertura</p>
        <p className={`text-sm ${cob.curta ? 'font-semibold text-amber-700' : ''}`}>{cob.texto}</p>
      </div>
    </div>
  )
}

function LinhaDoProduto({ produto }: { produto: ResumoDeProduto }) {
  return (
    <li className="border-t border-stone-100 bg-stone-50 px-4 py-3">
      <p className="text-sm font-medium text-stone-800">
        {produto.produtoNome ?? `Produto ${produto.produtoCodigo}`}
      </p>
      <div className="mt-1">
        <Numeros
          vendaQtd={produto.vendaQtd}
          vendaValor={produto.vendaValor}
          vmd={produto.vmd}
          estoqueQtd={produto.estoqueQtd}
          diaDoEstoque={produto.diaDoEstoque}
          coberturaDias={produto.coberturaDias}
        />
      </div>
    </li>
  )
}

/**
 * Uma loja, que abre nos produtos.
 *
 * `<details>` nativo em vez de estado React: é acessível de graça, funciona sem
 * JavaScript e não precisa de um `useState` por linha para lembrar o que está aberto.
 */
function BlocoDaLoja({ loja, linhas }: { loja: ResumoDeLoja; linhas: LinhaEspelho[] }) {
  const cob = textoCobertura(loja.coberturaDias)
  // A série é montada só quando a loja abre — 16 gráficos calculados de véspera seria
  // trabalho jogado fora em quase toda visita.
  const serie = serieDaLoja(linhas, loja.lojaCodigo)
  return (
    <li>
      <details className="group">
        <summary className="min-h-[44px] cursor-pointer list-none p-4 marker:hidden">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium">
              <span className="text-stone-400 transition-transform group-open:hidden">▸ </span>
              <span className="hidden text-stone-400 group-open:inline">▾ </span>
              Loja {loja.lojaCodigo}
              {loja.lojaNome ? ` — ${loja.lojaNome}` : ''}
            </p>
            <span className="shrink-0 text-xs text-stone-600">
              {loja.uf ?? ''}
              {cob.curta ? ' · apertada' : ''}
            </span>
          </div>
          <div className="mt-2">
            <Numeros
              vendaQtd={loja.vendaQtd}
              vendaValor={loja.vendaValor}
              vmd={loja.vmd}
              estoqueQtd={loja.estoqueQtd}
              diaDoEstoque={loja.diaDoEstoque}
              coberturaDias={loja.coberturaDias}
            />
          </div>
        </summary>
        <div className="border-t border-stone-100 px-4 pb-2 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-700">
            Estoque × venda por dia
          </p>
          <GraficoEstoqueVenda serie={serie} />
        </div>
        <ul>
          {loja.produtos.map((p) => (
            <LinhaDoProduto key={p.produtoCodigo} produto={p} />
          ))}
        </ul>
      </details>
    </li>
  )
}

export default function NasLojas() {
  const { data, isLoading, error } = useRede()
  const sincronizar = useSincronizarRede()

  if (isLoading) return <Carregando texto="Buscando o que saiu nas lojas…" />
  if (error) return <Erro mensagem={error.message} />
  if (!data) return <Vazio mensagem="Nada para mostrar ainda." />

  const pontosDeVenda = data.lojas.filter((l) => ehPontoDeVenda(l.lojaTipo))
  const centros = data.lojas.filter((l) => !ehPontoDeVenda(l.lojaTipo))
  const rede = resumirRede(pontosDeVenda)
  const cobRede = textoCobertura(rede.coberturaDias)

  const falhou = data.ultimaSincronia && data.ultimaSincronia.resultado !== 'ok'

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Nas lojas</h1>
          {/* O carimbo fica visível sem abrir nada: espelho sem data vira número velho
              com cara de novo. */}
          <p className="text-sm text-stone-700">
            {`Seus produtos nas lojas da rede`}
            {data.diaDoDado ? ` · dado de ${dataLonga(data.diaDoDado)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => sincronizar.mutate()}
          disabled={sincronizar.isPending}
          className="min-h-[44px] shrink-0 rounded-lg bg-stone-800 px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {sincronizar.isPending ? 'Buscando…' : 'Atualizar'}
        </button>
      </div>

      {sincronizar.error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {sincronizar.error.message}
        </p>
      )}

      {falhou && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          A última busca automática não deu certo, então os números abaixo são os da busca
          anterior. {data.ultimaSincronia?.detalhe}
        </p>
      )}

      {data.lojas.length === 0 ? (
        <Vazio mensagem="O espelho ainda não foi carregado. Toque em Atualizar." />
      ) : (
        <>
          {/* O grupo do cliente: o total da rede, e as lojas abrem embaixo. */}
          <section className="mt-4 rounded-xl bg-white p-4 shadow">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-bold">Rede Rondelli</h2>
              <span className="text-xs text-stone-600">
                {rede.lojas} {rede.lojas === 1 ? 'loja' : 'lojas'}
                {rede.apertadas > 0 ? ` · ${rede.apertadas} apertada${rede.apertadas > 1 ? 's' : ''}` : ''}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-600">
              Somando os {JANELA_DIAS} dias que terminam no último dia com venda.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-600">Vendeu</p>
                <p className="text-2xl font-bold tabular-nums">{numeroTexto(rede.vendaQtd)}</p>
                <p className="text-sm text-stone-700">{reais(rede.vendaValor)}</p>
                <p className="text-sm text-stone-700">VMD {vmdTexto(rede.vmd)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-600">Em estoque</p>
                <p className="text-2xl font-bold tabular-nums">
                  {rede.estoqueQtd === null ? '—' : numeroTexto(rede.estoqueQtd)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-600">Cobertura</p>
                <p className={`text-sm ${cobRede.curta ? 'font-semibold text-amber-700' : ''}`}>
                  {cobRede.texto}
                </p>
              </div>
            </div>
          </section>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-stone-700">
            Loja a loja
          </h2>
          <p className="text-xs text-stone-600">Toque numa loja para abrir os dois cafés.</p>
          <ul className="mt-2 divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
            {pontosDeVenda.map((loja) => (
              <BlocoDaLoja key={loja.lojaCodigo} loja={loja} linhas={data.linhas} />
            ))}
          </ul>

          {centros.length > 0 && (
            <>
              <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-stone-700">
                Centros de distribuição
              </h2>
              {/* Separados porque a saída de um CD é abastecimento de loja, não venda ao
                  consumidor — somar os dois contaria o mesmo café duas vezes. */}
              <p className="text-xs text-stone-600">
                A saída daqui abastece as lojas; não entra no total da rede acima.
              </p>
              <ul className="mt-2 divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
                {centros.map((loja) => (
                  <BlocoDaLoja key={loja.lojaCodigo} loja={loja} linhas={data.linhas} />
                ))}
              </ul>
            </>
          )}

          <p className="mt-6 text-xs text-stone-600">
            O estoque é a foto da abertura do dia — durante o dia a loja vende e o número
            real cai. Quantidade é líquida de devolução. Atualiza sozinho todo dia às 6h30.
          </p>
        </>
      )}
    </div>
  )
}
