import { useState } from 'react'
import {
  useSalvarPrecoCliente,
  useRemoverPrecoCliente,
  usePrecosCliente,
} from '@/hooks/usePrecosCliente'
import { useProdutos } from '@/hooks/useProdutos'
import { dataLonga, reais } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import { precoClienteVigente } from '@/lib/preco'
import { hojeIso } from '@/lib/data'

/**
 * Preço combinado com este cliente, produto a produto.
 *
 * **Vence a faixa de kg**: com preço aqui, o volume do pedido deixa de mudar o valor do
 * pacote — é o que "para esse cliente é sempre o mesmo preço" significa.
 *
 * Reajuste é registro novo, não edição: salvar hoje cria a vigência de hoje e o preço
 * antigo continua valendo para trás. Pedido já lançado não muda, porque ele guarda o preço
 * congelado do dia dele.
 *
 * Só admin vê e mexe — a RLS recusa escrita de qualquer outro papel de qualquer jeito.
 */
export function PrecoCombinado({ clienteId, ehAdmin }: { clienteId: string; ehAdmin: boolean }) {
  const { data: produtos } = useProdutos()
  const { data: precos } = usePrecosCliente(clienteId)
  const salvar = useSalvarPrecoCliente()
  const remover = useRemoverPrecoCliente()
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const [aberto, setAberto] = useState(false)

  if (!ehAdmin) return null

  const hoje = hojeIso()
  const ativos = (produtos ?? []).filter((produto) => produto.ativo)
  const combinados = ativos.filter(
    (produto) => precoClienteVigente(precos ?? [], produto.id, hoje) !== null,
  ).length

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="flex min-h-11 w-full items-center justify-between text-left"
      >
        <span className="font-medium">Preço combinado</span>
        <span className="text-sm text-stone-600">
          {aberto ? 'fechar' : combinados === 0 ? 'nenhum — usa a tabela' : `${combinados} produto(s)`}
        </span>
      </button>

      {aberto && (
        <>
          <p className="mt-1 text-sm text-stone-700">
            Preço fixo deste cliente. Ele <strong>vence a tabela por faixa de kg</strong>: o
            tamanho do pedido deixa de mudar o valor do pacote.
          </p>

          <ul className="mt-3 space-y-3">
            {ativos.map((produto) => {
              const vigente = precoClienteVigente(precos ?? [], produto.id, hoje)
              const linhaAtual = (precos ?? [])
                .filter((preco) => preco.produtoId === produto.id && preco.vigenteDesde <= hoje)
                .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0]
              return (
                <li key={produto.id} className="border-t border-stone-100 pt-3 first:border-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{produto.nome}</span>
                    <span className="text-sm tabular-nums">
                      {vigente === null ? (
                        <span className="text-stone-500">tabela</span>
                      ) : (
                        <strong>{reais(vigente)}</strong>
                      )}
                    </span>
                  </div>
                  {linhaAtual && (
                    <p className="text-xs text-stone-500">
                      combinado desde {dataLonga(linhaAtual.vigenteDesde)}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      inputMode="decimal"
                      placeholder={vigente === null ? 'preço do pacote' : String(vigente).replace('.', ',')}
                      value={rascunho[produto.id] ?? ''}
                      onChange={(evento) =>
                        setRascunho({ ...rascunho, [produto.id]: evento.target.value })
                      }
                      className="min-h-11 flex-1 rounded-lg border border-stone-300 px-3"
                    />
                    <button
                      type="button"
                      disabled={salvar.isPending || !(rascunho[produto.id] ?? '').trim()}
                      onClick={() =>
                        salvar.mutate(
                          {
                            clienteId,
                            produtoId: produto.id,
                            precoUnit: paraNumero(rascunho[produto.id] ?? ''),
                          },
                          { onSuccess: () => setRascunho({ ...rascunho, [produto.id]: '' }) },
                        )
                      }
                      className="min-h-11 rounded-lg bg-amber-800 px-4 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Salvar
                    </button>
                    {linhaAtual && (
                      <button
                        type="button"
                        disabled={remover.isPending}
                        onClick={() => remover.mutate(linhaAtual.id)}
                        className="min-h-11 rounded-lg border border-stone-300 px-3 text-sm"
                      >
                        Tabela
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {salvar.error && <p className="mt-2 text-sm text-red-700">{salvar.error.message}</p>}
          {remover.error && <p className="mt-2 text-sm text-red-700">{remover.error.message}</p>}

          <p className="mt-3 text-xs text-stone-600">
            Salvar cria a vigência de hoje — o preço anterior continua valendo para o passado, e
            pedido já lançado não muda. <strong>A comissão sai do valor do pedido</strong>, então
            preço menor também significa comissão menor.
          </p>
        </>
      )}
    </section>
  )
}
