import { useState } from 'react'
import { dataCurta, dataLonga, diasTexto, numeroTexto } from '@/lib/formato'
import { escalaBonita, indicesComData } from '@/lib/grafico'
import { LIMITE_COBERTURA_DIAS, type SerieDaLoja } from '@/lib/rede'

/**
 * "Estoque × venda por dia" — a mesma leitura do gráfico da Ficha 360 do ProcessDesk:
 * venda em barras no eixo da direita, estoque em linha no eixo da esquerda, e um corte
 * horizontal marcando onde o estoque passa de LIMITE_COBERTURA_DIAS de venda parada.
 *
 * SVG à mão em vez de uma biblioteca de gráfico: o bundle do app já está em 651 KB, e
 * duas séries e uma linha de corte não pagam mais 250 KB de recharts no celular de quem
 * está na rua.
 *
 * A escala tem teto REDONDO (escalaBonita) porque a pergunta que este gráfico responde é
 * "quanto vendeu neste dia?", e barra medida contra uma marca quebrada como 39 não
 * responde nada. Para o número exato, tocar no dia — o painel acima do desenho mostra a
 * data por extenso, a venda e o estoque daquele dia.
 *
 * ⚠️ O que este gráfico NÃO tem, e o da Ficha 360 tem: a barra de ENTRADA de mercadoria.
 * Ela vem de ml_stock_movements (CGO 1/50/51), que não está no feed da indústria. Sem o
 * dado, desenhar a barra seria inventá-la.
 *
 * ⚠️ A foto de estoque é de ABERTURA do dia: o movimento do dia D aparece na foto de D+1
 * (ver docs/CGO-CONSINCO.md no ProcessDesk). Por isso a linha de estoque "reage" um dia
 * depois da barra de venda — não é defasagem de desenho, é o que o dado diz.
 */
export function GraficoEstoqueVenda({ serie }: { serie: SerieDaLoja }) {
  const [selecionado, setSelecionado] = useState<number | null>(null)

  if (serie.pontos.length === 0) {
    return <p className="py-4 text-center text-sm text-stone-600">Sem série para desenhar.</p>
  }

  const L = 30 // eixo do estoque
  const R = 30 // eixo da venda
  const TOPO = 10
  const BASE = 22
  const LARGURA = 320
  const ALTURA = 150
  const larguraUtil = LARGURA - L - R
  const alturaUtil = ALTURA - TOPO - BASE

  const pontos = serie.pontos
  const n = pontos.length

  const venda = escalaBonita(Math.max(...pontos.map((p) => p.vendaQtd ?? 0)))
  // O teto do estoque inclui a linha de corte: se o corte ficasse fora da área, o gráfico
  // mostraria "tudo abaixo do limite" só porque o limite não coube na tela.
  const estoque = escalaBonita(
    Math.max(...pontos.map((p) => p.estoqueQtd ?? 0), serie.limiteEstoque ?? 0),
  )

  const faixa = larguraUtil / n
  const x = (i: number) => L + faixa * (i + 0.5)
  const yEstoque = (v: number) => TOPO + alturaUtil - (v / estoque.teto) * alturaUtil
  const yVenda = (v: number) => TOPO + alturaUtil - (v / venda.teto) * alturaUtil

  // Segmentos: a linha se INTERROMPE em dia sem foto, em vez de ligar dois pontos
  // distantes fingindo que o estoque andou em linha reta entre eles.
  const segmentos: string[] = []
  let atual: string[] = []
  pontos.forEach((p, i) => {
    if (p.estoqueQtd === null) {
      if (atual.length > 1) segmentos.push(atual.join(' '))
      atual = []
      return
    }
    atual.push(`${atual.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yEstoque(p.estoqueQtd).toFixed(1)}`)
  })
  if (atual.length > 1) segmentos.push(atual.join(' '))

  const larguraBarra = Math.max(1.5, Math.min(7, faixa - 1))
  const yCorte = serie.limiteEstoque === null ? null : yEstoque(serie.limiteEstoque)
  const datas = indicesComData(n)
  const ponto = selecionado === null ? null : pontos[selecionado]

  return (
    <div>
      {/* Painel de leitura: é ele que responde "quanto vendeu neste dia?" com o número
          exato. Fica em cima e com altura fixa, senão o gráfico pula ao tocar. */}
      <div className="mb-1 min-h-[34px] rounded-lg bg-stone-100 px-2 py-1 text-xs">
        {ponto ? (
          <>
            <span className="font-semibold text-stone-800">{dataLonga(ponto.dia)}</span>
            <span className="ml-2 text-green-700">
              vendeu {ponto.vendaQtd === null ? '—' : numeroTexto(ponto.vendaQtd)}
            </span>
            <span className="ml-2 text-blue-700">
              estoque {ponto.estoqueQtd === null ? 'sem foto' : numeroTexto(ponto.estoqueQtd)}
            </span>
          </>
        ) : (
          <span className="text-stone-600">Toque num dia para ver o número exato.</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="w-full touch-manipulation"
        role="img"
        aria-label={`Estoque e venda por dia, de ${dataCurta(pontos[0].dia)} a ${dataCurta(pontos[n - 1].dia)}`}
      >
        {/* grade: é a régua contra a qual se mede a altura da barra */}
        {venda.marcas.map((m) => (
          <g key={`g${m}`}>
            <line
              x1={L}
              x2={LARGURA - R}
              y1={yVenda(m)}
              y2={yVenda(m)}
              stroke="#e7e5e4"
              strokeWidth="1"
            />
            <text x={LARGURA - R + 3} y={yVenda(m) + 3} fontSize="8" fill="#15803d">
              {numeroTexto(m)}
            </text>
          </g>
        ))}
        {estoque.marcas.map((m) => (
          <text key={`e${m}`} x={L - 3} y={yEstoque(m) + 3} fontSize="8" fill="#1d4ed8" textAnchor="end">
            {numeroTexto(m)}
          </text>
        ))}

        {/* dia selecionado, atrás das séries */}
        {selecionado !== null && (
          <rect
            x={L + faixa * selecionado}
            y={TOPO}
            width={faixa}
            height={alturaUtil}
            fill="#0c0a09"
            opacity="0.07"
          />
        )}

        {/* corte: acima dele o estoque passa de 30 dias de venda parada */}
        {yCorte !== null && (
          <line
            x1={L}
            x2={LARGURA - R}
            y1={yCorte}
            y2={yCorte}
            stroke="#dc2626"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
        )}

        {/* venda do dia */}
        {pontos.map((p, i) =>
          p.vendaQtd === null || p.vendaQtd <= 0 ? null : (
            <rect
              key={`v${p.dia}`}
              x={x(i) - larguraBarra / 2}
              y={yVenda(p.vendaQtd)}
              width={larguraBarra}
              height={Math.max(0.5, TOPO + alturaUtil - yVenda(p.vendaQtd))}
              fill="#16a34a"
              opacity={selecionado === null || selecionado === i ? 0.85 : 0.35}
            />
          ),
        )}

        {/* estoque */}
        {segmentos.map((d) => (
          <path key={d.slice(0, 24)} d={d} fill="none" stroke="#2563eb" strokeWidth="1.5" />
        ))}

        {/* eixo de base e datas ao longo dele */}
        <line x1={L} x2={LARGURA - R} y1={TOPO + alturaUtil} y2={TOPO + alturaUtil} stroke="#a8a29e" />
        {datas.map((i) => (
          <text
            key={`d${i}`}
            x={x(i)}
            y={ALTURA - 10}
            fontSize="8"
            fill="#57534e"
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          >
            {dataCurta(pontos[i].dia)}
          </text>
        ))}

        {/* alvos de toque: uma faixa inteira por dia, para o dedo acertar mesmo com a
            barra fina. Ficam por último, então recebem o toque antes do resto. */}
        {pontos.map((p, i) => (
          <rect
            key={`t${p.dia}`}
            x={L + faixa * i}
            y={TOPO}
            width={faixa}
            height={alturaUtil}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onPointerDown={() => setSelecionado(selecionado === i ? null : i)}
          />
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-green-600" /> venda do dia
          <span className="text-stone-400">(direita)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-blue-600" /> estoque
          <span className="text-stone-400">(esquerda)</span>
        </span>
        {serie.limiteEstoque !== null && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 border-t border-dashed border-red-600" />
            {diasTexto(LIMITE_COBERTURA_DIAS)} de venda
          </span>
        )}
      </div>

      {serie.diasSemFoto > 0 && (
        // A linha some nesses dias de propósito. Dizer isso evita que o buraco seja lido
        // como "o estoque zerou".
        <p className="mt-1 text-xs text-stone-600">
          {serie.diasSemFoto === 1 ? '1 dia sem foto de estoque' : `${serie.diasSemFoto} dias sem foto de estoque`} —
          a linha se interrompe ali; não é estoque zerado.
        </p>
      )}
      <p className="mt-1 text-xs text-stone-500">
        A foto de estoque é da abertura do dia, então ela reage à venda no dia seguinte. A
        barra de entrada de mercadoria não aparece aqui: esse dado não vem no que a rede
        compartilha.
      </p>
    </div>
  )
}
