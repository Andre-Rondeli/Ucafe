import { useMemo, useState } from 'react'
import { Cartao } from '@/componentes/Cartao'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import { useBasesComissao, useRegrasComissao } from '@/hooks/useComissao'
import { useEquipe } from '@/hooks/useEquipe'
import { useAuth } from '@/hooks/useAuth'
import { comissaoDaBase, limitesDoMes, percentualVigente, resumoComissao } from '@/lib/comissao'
import { addDias, hojeIso } from '@/lib/data'
import { dataCurta, numeroTexto, reais } from '@/lib/formato'

const ROTULO_ORIGEM = { pedido: 'Pedido', consignado: 'Consignado' } as const

function mesAnterior(iso: string): string {
  const { inicio } = limitesDoMes(iso)
  return addDias(inicio, -1)
}

function mesSeguinte(iso: string): string {
  const { fim } = limitesDoMes(iso)
  return addDias(fim, 1)
}

export default function Comissao() {
  const { usuarioId, papel } = useAuth()
  const [referencia, setReferencia] = useState(hojeIso())
  const { data: equipe } = useEquipe({ enabled: papel === 'admin' })
  const [vendedorId, setVendedorId] = useState<string | null>(null)

  const vendedorEfetivo = papel === 'admin' ? vendedorId : usuarioId
  const { inicio, fim } = limitesDoMes(referencia)

  const { data: regras, isLoading: carregandoRegras, error: erroRegras } = useRegrasComissao(vendedorEfetivo)
  const {
    data: bases,
    isLoading: carregandoBases,
    error: erroBases,
  } = useBasesComissao(vendedorEfetivo, inicio, fim)

  const resumo = useMemo(() => {
    if (!bases || !regras) return null
    return resumoComissao(bases, regras)
  }, [bases, regras])

  const percentualHoje = regras ? percentualVigente(regras, hojeIso()) : null

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold">Comissão</h1>

      <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-3 shadow">
        <button
          onClick={() => setReferencia(mesAnterior(referencia))}
          className="flex min-h-11 min-w-11 items-center justify-center text-stone-700"
        >
          ◀
        </button>
        <span className="font-medium tabular-nums">
          {inicio.slice(5, 7)}/{inicio.slice(0, 4)}
        </span>
        <button
          onClick={() => setReferencia(mesSeguinte(referencia))}
          className="flex min-h-11 min-w-11 items-center justify-center text-stone-700"
        >
          ▶
        </button>
      </div>

      {papel === 'admin' && (
        <select
          value={vendedorId ?? ''}
          onChange={(e) => setVendedorId(e.target.value || null)}
          className="mb-4 w-full rounded-lg border border-stone-300 px-3 py-3"
        >
          <option value="">Selecione um vendedor</option>
          {equipe?.map((membro) => (
            <option key={membro.id} value={membro.id}>
              {membro.nome}
            </option>
          ))}
        </select>
      )}

      {!vendedorEfetivo ? (
        <Vazio mensagem="Selecione um vendedor para ver a comissão." />
      ) : carregandoRegras || carregandoBases ? (
        <Carregando />
      ) : erroRegras || erroBases ? (
        <Erro mensagem={(erroRegras ?? erroBases)!.message} />
      ) : !resumo || resumo.quantidade === 0 ? (
        <Vazio mensagem="Nenhuma venda comissionável nesse mês. Assim que houver pedido ou consignado apurado, a comissão aparece aqui." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Cartao titulo="Base total" valor={reais(resumo.baseTotal)} />
            {/* é o percentual de HOJE, mesmo navegando mês passado — o cálculo por linha usa a regra da data de cada venda */}
            <Cartao
              titulo="Percentual vigente"
              valor={`${percentualHoje === null ? '—' : numeroTexto(percentualHoje)}%`}
              detalhe="hoje"
            />
            <Cartao titulo="Comissão total" valor={reais(resumo.comissaoTotal)} alerta />
            <Cartao
              titulo="Por origem (pedido / consignado)"
              valor={`${reais(resumo.porOrigem.pedido.comissao)} / ${reais(resumo.porOrigem.consignado.comissao)}`}
              detalhe={`Base ${reais(resumo.porOrigem.pedido.base)} / ${reais(resumo.porOrigem.consignado.base)}`}
            />
          </div>

          <ul className="mb-4 divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
            {bases!.map((base, indice) => (
              <li key={indice} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-medium">{base.descricao}</p>
                  <p className="text-stone-700">
                    {dataCurta(base.data)} · {ROTULO_ORIGEM[base.origem]}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p>{reais(base.valor)}</p>
                  <p className="text-stone-700">{reais(comissaoDaBase(base, regras!))}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs text-stone-700">
            Comissão calculada sobre o valor vendido. Cobrança e pagamento ficam no ERP — aqui é só o
            cálculo.
          </p>
        </>
      )}
    </div>
  )
}
