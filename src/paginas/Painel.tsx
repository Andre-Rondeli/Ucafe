import { useMemo, useState } from 'react'
import { BlocoInsight } from '@/componentes/BlocoInsight'
import { BlocoPrazo } from '@/componentes/BlocoPrazo'
import { Cartao } from '@/componentes/Cartao'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import { useAuth } from '@/hooks/useAuth'
import { useClientes } from '@/hooks/useClientes'
import { usePedidos } from '@/hooks/usePedidos'
import { usePrecos } from '@/hooks/usePrecos'
import { useProdutoCustos } from '@/hooks/useProdutoCustos'
import { useProdutos } from '@/hooks/useProdutos'
import { addDias, hojeIso } from '@/lib/data'
import { dataCurta, kgTexto, numeroTexto, reais } from '@/lib/formato'
import { porCliente } from '@/lib/insights'
import { custoPorKgUnico, margemDoPeriodo } from '@/lib/margem'
import {
  apenasValidos,
  baseDeClientes,
  margemPorCliente,
  mixPorProduto,
  noPeriodo,
  porCanal,
  precoRealizadoVsTabela,
  rankingClientes,
  resumo,
  seriePorSemana,
} from '@/lib/metricas-venda'
import { ROTULO_CANAL } from '@/lib/tipos'

/**
 * Janelas do painel. "Este mês" é a primeira e a padrão: é o fechamento que o Carlos
 * olha. As de dias corridos continuam para comparar ritmo sem esperar virar o mês.
 */
const JANELAS = [
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: '30', rotulo: '30 dias' },
  { chave: '90', rotulo: '90 dias' },
  { chave: '365', rotulo: '12 meses' },
] as const

export default function Painel() {
  const { papel } = useAuth()
  const { data: pedidos, isLoading, error } = usePedidos()
  const { data: faixas, error: erroPrecos } = usePrecos()
  const { data: clientes, error: erroClientes } = useClientes()
  const { data: produtos } = useProdutos()
  const { data: custos } = useProdutoCustos()
  const [periodo, setPeriodo] = useState<string>('mes')

  const hoje = hojeIso()
  // "Este mês" começa no dia 1; as outras contam dias corridos para trás
  const inicio = periodo === 'mes' ? `${hoje.slice(0, 7)}-01` : addDias(hoje, -(Number(periodo) - 1))

  const dados = useMemo(() => {
    const validos = apenasValidos(pedidos ?? [])
    const janela = noPeriodo(validos, inicio, hoje)
    return {
      janela,
      resumo: resumo(janela),
      preco: faixas ? precoRealizadoVsTabela(janela, faixas) : null,
      mix: mixPorProduto(janela, produtos ?? []),
      serie: seriePorSemana(janela),
      ranking: rankingClientes(janela, 5),
      canais: porCanal(janela),
      base: baseDeClientes(validos, inicio, hoje),
      margem: margemDoPeriodo(janela),
      margemCliente: margemPorCliente(janela),
    }
  }, [pedidos, faixas, produtos, inicio, hoje])

  const cadencias = useMemo(
    () =>
      Object.fromEntries(
        (clientes ?? []).map((cliente) => [cliente.id, cliente.cadenciaDeclaradaDias]),
      ),
    [clientes],
  )

  const linhasInsight = useMemo(
    () => porCliente(apenasValidos(pedidos ?? []), cadencias, hoje),
    [pedidos, cadencias, hoje],
  )

  if (isLoading) return <Carregando />
  if (error) return <Erro mensagem={error.message} />
  if ((pedidos ?? []).length === 0)
    return <Vazio mensagem="Nenhuma venda ainda — o painel acende no primeiro pedido." />

  const { resumo: r, preco, mix, serie, ranking, canais, base, margem, margemCliente } = dados
  const maiorReceitaSemana = Math.max(1, ...serie.map((s) => s.receita))

  return (
    <div className="space-y-6 p-4">
      {erroPrecos && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Não foi possível carregar a tabela de preços — o indicador de desconto vs. tabela ficou
          indisponível.
        </p>
      )}
      {erroClientes && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Não foi possível carregar os clientes — a fila de ligação pode estar sem a cadência
          informada de alguns clientes.
        </p>
      )}

      <BlocoInsight linhas={linhasInsight} />

      <div className="flex gap-2">
        {JANELAS.map((opcao) => (
          <button
            key={opcao.chave}
            onClick={() => setPeriodo(opcao.chave)}
            className={`flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium ${
              periodo === opcao.chave ? 'bg-amber-800 text-white' : 'bg-white text-stone-600'
            }`}
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Quanto vendeu</h2>
        <div className="grid grid-cols-2 gap-3">
          <Cartao
            titulo="Volume"
            valor={kgTexto(r.kg)}
            detalhe={`${dados.janela.length} pedido(s)`}
          />
          <Cartao titulo="Receita" valor={reais(r.receita)} />
          <Cartao
            titulo="Ticket médio"
            valor={reais(r.ticketMedio)}
            detalhe="por pedido ou nota"
          />
          <Cartao
            titulo="Preço médio"
            valor={`${reais(r.precoMedioKg)}/kg`}
            detalhe={
              preco
                ? preco.descontoPercentual > 0
                  ? `${numeroTexto(preco.descontoPercentual)}% abaixo da tabela (pedidos do app)`
                  : 'no preço de tabela (pedidos do app)'
                : undefined
            }
            alerta={!!preco && preco.descontoPercentual >= 5}
          />
        </div>
      </section>

      {/* custo e margem só para o admin -- e o banco também não deixa o vendedor ler */}
      {papel === 'admin' && (
        <section>
          <h2 className="mb-2 font-semibold">Quanto sobrou</h2>
          <div className="grid grid-cols-2 gap-3">
            <Cartao
              titulo="Custo"
              valor={margem.completa ? reais(margem.custo) : '—'}
              detalhe={margem.completa ? undefined : 'Falta custo em algum produto'}
            />
            <Cartao
              titulo="Margem"
              valor={margem.margem === null ? '—' : reais(margem.margem)}
              detalhe={
                margem.margemPercentual === null
                  ? 'Cadastre o custo em Mais → Produtos'
                  : `${numeroTexto(margem.margemPercentual)}% da receita`
              }
              alerta={margem.margem !== null && margem.margem < 0}
            />
          </div>
          {margemCliente.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-2 text-sm font-semibold text-stone-600">Margem por cliente</h3>
              <ul className="divide-y divide-stone-200 rounded-xl bg-white shadow">
                {margemCliente.map((linha) => (
                  <li key={linha.clienteId} className="flex items-baseline justify-between gap-2 p-3 text-sm">
                    <span className="min-w-0 truncate">{linha.clienteNome}</span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        linha.margem !== null && linha.margem < 0 ? 'font-semibold text-red-700' : ''
                      }`}
                    >
                      {linha.margem === null ? '—' : reais(linha.margem)}
                      {linha.margemPercentual !== null && (
                        <span className="text-stone-600">
                          {' · '}
                          {numeroTexto(linha.margemPercentual)}%
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-stone-500">
                Ordenado por margem em R$, não em porcentagem: 40% de uma venda pequena não
                paga a conta que 12% de uma grande paga. A porcentagem ao lado é quem mostra
                se o cliente está sendo vendido barato.
              </p>
            </div>
          )}

          <p className="mt-2 text-xs text-stone-500">
            Item sem custo cadastrado fica de fora: margem pela metade engana mais do que
            informa. Cada pedido usa o custo congelado no dia em que foi lançado.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Mix de produto</h2>
        <p className="mb-2 text-xs text-stone-500">
          Só dos pedidos lançados no app — a nota do ERP não diz qual produto foi.
        </p>
        {mix.length === 0 ? (
          <Vazio mensagem="Sem pedido lançado no app nessa janela." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {mix.map((item) => (
              <Cartao
                key={item.produtoId ?? item.nome}
                titulo={item.nome}
                valor={kgTexto(item.kg)}
                detalhe={`${item.pacotes} pacotes · ${reais(item.receita)}`}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Evolução semanal</h2>
        {serie.length === 0 ? (
          <Vazio mensagem="Sem pedido nessa janela." />
        ) : (
          <ul className="space-y-2 rounded-xl bg-white p-4 shadow">
            {serie.map((semana) => (
              <li key={semana.semana}>
                <div className="flex justify-between text-sm tabular-nums">
                  <span>{dataCurta(semana.semana)}</span>
                  <span>
                    {kgTexto(semana.kg)} · {reais(semana.receita)}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-stone-100">
                  <div
                    className="h-2 rounded bg-amber-700"
                    style={{ width: `${(semana.receita / maiorReceitaSemana) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Top 5 clientes</h2>
        <ul className="divide-y divide-stone-200 rounded-xl bg-white shadow">
          {ranking.map((cliente) => (
            <li key={cliente.clienteId} className="flex justify-between p-3 text-sm">
              <span>{cliente.clienteNome}</span>
              <span className="tabular-nums">
                {kgTexto(cliente.kg)} · {reais(cliente.receita)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Por canal</h2>
        <ul className="divide-y divide-stone-200 rounded-xl bg-white shadow">
          {canais.map((canal) => (
            <li key={canal.canal ?? 'sem-cliente'} className="flex justify-between p-3 text-sm">
              <span>
                {canal.canal ? ROTULO_CANAL[canal.canal] : 'Nota do ERP sem cliente atrelado'}
              </span>
              <span className="tabular-nums">
                {kgTexto(canal.kg)} · {reais(canal.receita)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <BlocoPrazo pedidos={dados.janela} />

      <section>
        <h2 className="mb-2 font-semibold">
          {papel === 'admin' ? 'Base de clientes' : 'Seus clientes'}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Cartao titulo="Ativos" valor={String(base.ativos)} />
          <Cartao titulo="Novos" valor={String(base.novos)} />
          <Cartao titulo="Perdidos" valor={String(base.perdidos)} alerta={base.perdidos > 0} />
        </div>
      </section>
    </div>
  )
}
