import { useState } from 'react'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import { usePrecosProdutos, useSalvarFaixasProduto, type NovaFaixaProduto } from '@/hooks/usePrecos'
import { useProdutos } from '@/hooks/useProdutos'
import { hojeIso } from '@/lib/data'
import { dataLonga, reais } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { MULTIPLO_KG, validarFaixasProduto, type FaixaProduto } from '@/lib/preco'
import type { Produto } from '@/lib/tipos'

interface LinhaForm {
  produtoId: string
  kgMin: string
  kgMax: string
  precoUnit: string
}

/**
 * Faixas em vigor hoje: para cada produto, acha a maior vigenteDesde <= hoje e devolve
 * só as faixas daquela data — nunca mistura faixas de versões diferentes do mesmo produto.
 */
function vigentesHoje(faixas: FaixaProduto[], hoje: string): FaixaProduto[] {
  const jaVigentes = faixas.filter((f) => f.vigenteDesde <= hoje)
  const versaoPorProduto = new Map<string, string>()
  for (const faixa of jaVigentes) {
    const atual = versaoPorProduto.get(faixa.produtoId)
    if (!atual || faixa.vigenteDesde > atual) versaoPorProduto.set(faixa.produtoId, faixa.vigenteDesde)
  }
  return jaVigentes.filter((f) => f.vigenteDesde === versaoPorProduto.get(f.produtoId))
}

/**
 * Normaliza faixas legado (ex.: 0–10, 10.001–50) para a grade fechada de 5 em 5, por produto:
 * arredonda cada teto para o múltiplo de 5 mais próximo, força a primeira faixa a começar em
 * MULTIPLO_KG e reconstrói a contiguidade, preservando o preço de cada faixa na sua posição.
 */
function normalizarParaGrade5(faixas: FaixaProduto[], produtos: Produto[]): LinhaForm[] {
  const arredondar5 = (kg: number) => Math.round(kg / MULTIPLO_KG) * MULTIPLO_KG

  const linhas: LinhaForm[] = []
  for (const produto of produtos) {
    const doProduto = faixas.filter((f) => f.produtoId === produto.id).sort((a, b) => a.kgMin - b.kgMin)
    if (doProduto.length === 0) continue

    let piso = MULTIPLO_KG
    doProduto.forEach((faixa, indice) => {
      const ultima = indice === doProduto.length - 1
      const tetoArredondado = faixa.kgMax === null ? piso : arredondar5(faixa.kgMax)
      const teto = ultima ? null : Math.max(tetoArredondado, piso + MULTIPLO_KG)
      linhas.push({
        produtoId: produto.id,
        kgMin: String(piso),
        kgMax: teto === null ? '' : String(teto),
        precoUnit: String(faixa.precoUnit),
      })
      if (teto !== null) piso = teto + MULTIPLO_KG
    })
  }
  return linhas
}

export default function TabelaPrecos() {
  const { data: faixas, isLoading: carregandoFaixas, error: erroFaixas } = usePrecosProdutos()
  const { data: produtos, isLoading: carregandoProdutos, error: erroProdutos } = useProdutos()
  const salvar = useSalvarFaixasProduto()
  const [vigenteDesde, setVigenteDesde] = useState(hojeIso())
  const [linhas, setLinhas] = useState<LinhaForm[]>([])
  const [erroForm, setErroForm] = useState<string | null>(null)

  if (carregandoFaixas || carregandoProdutos) return <Carregando />
  if (erroFaixas) return <Erro mensagem={erroFaixas.message} />
  if (erroProdutos) return <Erro mensagem={erroProdutos.message} />

  const listaProdutos = produtos ?? []
  const nomeProduto = (produtoId: string) => listaProdutos.find((p) => p.id === produtoId)?.nome ?? produtoId

  const emVigor = vigentesHoje(faixas ?? [], hojeIso()).sort(
    (a, b) => nomeProduto(a.produtoId).localeCompare(nomeProduto(b.produtoId)) || a.kgMin - b.kgMin,
  )
  const jaExisteNaData = (faixas ?? []).some((f) => f.vigenteDesde === vigenteDesde)

  function carregarDoAtual() {
    setLinhas(normalizarParaGrade5(emVigor, listaProdutos))
  }

  function adicionarLinha() {
    setLinhas([...linhas, { produtoId: listaProdutos[0]?.id ?? '', kgMin: '', kgMax: '', precoUnit: '' }])
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErroForm(null)
    const novas: NovaFaixaProduto[] = linhas.map((linha) => ({
      produtoId: linha.produtoId,
      kgMin: paraNumero(linha.kgMin),
      kgMax: linha.kgMax === '' ? null : paraNumero(linha.kgMax),
      precoUnit: paraNumero(linha.precoUnit),
      vigenteDesde,
    }))

    const erro = validarFaixasProduto(novas, listaProdutos)
    if (erro) {
      setErroForm(erro)
      return
    }

    await salvar.mutateAsync(novas)
    setLinhas([])
  }

  return (
    <div className="space-y-6 p-4">
      <section>
        <h1 className="text-xl font-bold">Tabela de preços em vigor</h1>
        {emVigor.length === 0 ? (
          <Vazio mensagem="Nenhuma faixa cadastrada. Adicione uma faixa no formulário abaixo." />
        ) : (
          <table className="mt-3 w-full overflow-hidden rounded-xl bg-white text-sm tabular-nums shadow">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="p-2">Produto</th>
                <th className="p-2">Faixa (kg do pedido)</th>
                <th className="p-2">Preço</th>
                <th className="p-2">Desde</th>
              </tr>
            </thead>
            <tbody>
              {emVigor.map((faixa) => (
                <tr key={faixa.id} className="border-t border-stone-200">
                  <td className="p-2">{nomeProduto(faixa.produtoId)}</td>
                  <td className="p-2">
                    {faixa.kgMin} – {faixa.kgMax === null ? 'sem teto' : faixa.kgMax}
                  </td>
                  <td className="p-2">{reais(faixa.precoUnit)}</td>
                  <td className="p-2">{dataLonga(faixa.vigenteDesde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <form onSubmit={enviar} className="space-y-3 rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold">Nova versão da tabela</h2>
        <p className="text-sm text-stone-700">
          Salvar substitui inteiramente a versão gravada nesta data de vigência. Datas
          anteriores continuam intactas como histórico dos pedidos já lançados.
        </p>

        <label className="block text-sm">
          Vigente a partir de
          <input
            type="date"
            required
            value={vigenteDesde}
            onChange={(e) => setVigenteDesde(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={carregarDoAtual}
            className="min-h-11 rounded-lg border border-stone-300 px-3 text-sm"
          >
            Copiar a tabela atual
          </button>
          <button
            type="button"
            onClick={adicionarLinha}
            disabled={listaProdutos.length === 0}
            className="min-h-11 rounded-lg border border-stone-300 px-3 text-sm disabled:opacity-50"
          >
            + Faixa
          </button>
        </div>

        <p className="text-sm text-stone-700">
          Faixas fechadas de 5 em 5 (o pedido é sempre múltiplo de 5 kg): 5 a 25, 30 a 50, 55 sem
          teto.
        </p>

        {linhas.map((linha, indice) => (
          <div key={indice} className="grid grid-cols-4 gap-2">
            <select
              value={linha.produtoId}
              onChange={(e) => {
                const copia = [...linhas]
                copia[indice] = { ...linha, produtoId: e.target.value }
                setLinhas(copia)
              }}
              className="rounded-lg border border-stone-300 px-2 py-3 text-sm"
            >
              {listaProdutos.map((produto) => (
                <option key={produto.id} value={produto.id}>
                  {produto.nome}
                </option>
              ))}
            </select>
            <input
              placeholder="kg min"
              inputMode="decimal"
              value={linha.kgMin}
              onChange={(e) => {
                const copia = [...linhas]
                copia[indice] = { ...linha, kgMin: e.target.value }
                setLinhas(copia)
              }}
              className="rounded-lg border border-stone-300 px-2 py-3"
            />
            <input
              placeholder="kg max"
              inputMode="decimal"
              value={linha.kgMax}
              onChange={(e) => {
                const copia = [...linhas]
                copia[indice] = { ...linha, kgMax: e.target.value }
                setLinhas(copia)
              }}
              className="rounded-lg border border-stone-300 px-2 py-3"
            />
            <input
              placeholder="preço"
              inputMode="decimal"
              value={linha.precoUnit}
              onChange={(e) => {
                const copia = [...linhas]
                copia[indice] = { ...linha, precoUnit: e.target.value }
                setLinhas(copia)
              }}
              className="rounded-lg border border-stone-300 px-2 py-3"
            />
          </div>
        ))}

        {jaExisteNaData && (
          <p className="text-sm text-amber-800">
            Já existe uma tabela com vigência em {dataLonga(vigenteDesde)}. Salvar vai
            substituí-la.
          </p>
        )}
        {erroForm && <p className="text-sm text-red-700">{erroForm}</p>}
        {salvar.error && <p className="text-sm text-red-700">{salvar.error.message}</p>}

        <button
          type="submit"
          disabled={linhas.length === 0 || salvar.isPending}
          className="w-full rounded-lg bg-amber-800 py-3 font-semibold text-white disabled:opacity-50"
        >
          {salvar.isPending ? 'Salvando…' : 'Salvar nova versão'}
        </button>
      </form>
    </div>
  )
}
