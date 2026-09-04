import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import { useAuth } from '@/hooks/useAuth'
import { useClientes, useSalvarCliente, type Cliente } from '@/hooks/useClientes'
import { useEquipe } from '@/hooks/useEquipe'
import { usePedidos } from '@/hooks/usePedidos'
import { hojeIso } from '@/lib/data'
import { porCliente } from '@/lib/insights'
import { diasTexto, kgTexto } from '@/lib/formato'
import { janelaDeVenda, type EstoqueNoCliente, type JanelaDeVenda } from '@/lib/recompra'
import { digitosDoDocumento, documentoFormatado } from '@/lib/cnpj'
import { traduzirErro } from '@/lib/erros'
import { paraNumero } from '@/lib/numero'
import { ROTULO_CANAL, ROTULO_CONDICAO, type Canal, type CondicaoPagamento } from '@/lib/tipos'

const VAZIO = {
  nome: '',
  canal: 'revenda' as Canal,
  cidade: '',
  whatsapp: '',
  documento: '',
  condicaoPadrao: 'avista' as CondicaoPagamento,
  cadenciaDeclaradaDias: '' as string,
  prazoConsignadoDias: '30' as string,
  ativo: true,
  vendedorId: '' as string,
}

const CORES: Record<JanelaDeVenda['cor'], { bolinha: string; texto: string }> = {
  verde: { bolinha: 'bg-emerald-600', texto: 'text-emerald-800' },
  amarelo: { bolinha: 'bg-amber-500', texto: 'text-amber-800' },
  vermelho: { bolinha: 'bg-red-600', texto: 'text-red-800' },
  sem_dado: { bolinha: 'bg-stone-300', texto: 'text-stone-500' },
}

/**
 * Semáforo de recompra na lista: dá para vender hoje?
 *
 * Verde = ele já devia ter repetido o pedido (passou 50% do ciclo além do ponto) — é onde
 * a ligação vira venda. Amarelo = está na janela. Vermelho = comprou há pouco. A régua é o
 * ciclo DO CLIENTE: 5 dias de atraso é urgente para quem compra toda semana e irrelevante
 * para quem compra a cada dois meses.
 */
function SemaforoRecompra({ janela }: { janela: JanelaDeVenda }) {
  const cor = CORES[janela.cor]
  return (
    <span className={`flex items-center gap-1.5 text-xs ${cor.texto}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cor.bolinha}`} aria-hidden="true" />
      {janela.rotulo}
      {janela.cor === 'verde' && <strong className="font-semibold">· pode vender</strong>}
    </span>
  )
}

export default function Clientes() {
  const { papel } = useAuth()
  const { data: clientes, isLoading, error } = useClientes()
  const { data: pedidos } = usePedidos()
  const { data: equipe } = useEquipe({ enabled: papel === 'admin' })
  const salvar = useSalvarCliente()
  const [form, setForm] = useState(VAZIO)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [erroDocumento, setErroDocumento] = useState<string | null>(null)
  const emEdicao = (clientes ?? []).find((c) => c.id === editandoId) ?? null

  function abrirNovo() {
    setForm(VAZIO)
    setEditandoId(null)
    setErroDocumento(null)
    setAberto(true)
  }

  function abrirEdicao(cliente: Cliente) {
    setForm({
      nome: cliente.nome,
      canal: cliente.canal,
      cidade: cliente.cidade ?? '',
      whatsapp: cliente.whatsapp ?? '',
      documento: cliente.documento ?? '',
      condicaoPadrao: cliente.condicaoPadrao,
      cadenciaDeclaradaDias:
        cliente.cadenciaDeclaradaDias === null ? '' : String(cliente.cadenciaDeclaradaDias),
      prazoConsignadoDias: String(cliente.prazoConsignadoDias),
      ativo: cliente.ativo,
      vendedorId: cliente.vendedorId,
    })
    setEditandoId(cliente.id)
    setErroDocumento(null)
    setAberto(true)
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()

    // CNPJ digitado torto não pode virar null em silêncio: sem documento o cliente não
    // casa com nada depois, e meses adiante ninguém entende por quê.
    const digitado = form.documento.trim()
    const documento = digitado ? digitosDoDocumento(digitado) : null
    if (digitado && !documento) {
      setErroDocumento('CNPJ tem 14 dígitos e CPF tem 11. Confira o que foi digitado.')
      return
    }
    setErroDocumento(null)

    await salvar.mutateAsync({
      id: editandoId ?? undefined,
      nome: form.nome.trim(),
      canal: form.canal,
      cidade: form.cidade.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      documento,
      condicaoPadrao: form.condicaoPadrao,
      cadenciaDeclaradaDias: form.cadenciaDeclaradaDias
        ? paraNumero(form.cadenciaDeclaradaDias)
        : null,
      prazoConsignadoDias: paraNumero(form.prazoConsignadoDias) || 30,
      ativo: form.ativo,
      ...(papel === 'admin' && form.vendedorId ? { vendedorId: form.vendedorId } : {}),
    })

    setAberto(false)
  }

  /*
   * FICA ACIMA dos returns de carregamento DE PROPÓSITO: hook não pode vir depois de
   * saída antecipada. Enquanto isLoading, esta tela rodava um hook A MENOS; quando o
   * dado chegava rodava um a mais, e o React derrubava a tela inteira (erro #310). Os
   * `?? []` aqui dentro já cobrem o render sem dado.
   */
  const janelas = useMemo(() => {
    const doApp = (pedidos ?? []).filter((pedido) => pedido.status !== 'cancelado')
    const cadencias = Object.fromEntries(
      (clientes ?? []).map((cliente) => [cliente.id, cliente.cadenciaDeclaradaDias]),
    )
    const hoje = hojeIso()
    const porId = new Map<string, { janela: JanelaDeVenda; estoque: EstoqueNoCliente | null }>()
    for (const linha of porCliente(doApp, cadencias, hoje)) {
      porId.set(linha.clienteId, { janela: janelaDeVenda(linha.previsao), estoque: linha.estoque })
    }
    return porId
  }, [pedidos, clientes])

  if (isLoading) return <Carregando />
  if (error) return <Erro mensagem={error.message} />

  const filtrados = (clientes ?? []).filter((cliente) =>
    cliente.nome.toLowerCase().includes(busca.toLowerCase()),
  )

  return (
    <div className="p-4">
      <div className="mb-4 flex gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-3"
        />
        <button
          onClick={abrirNovo}
          className="rounded-lg bg-amber-800 px-4 py-2 font-semibold text-white"
        >
          Novo
        </button>
      </div>

      {aberto && (
        <form onSubmit={enviar} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow">
          <label className="block text-sm text-stone-600">
            CNPJ ou CPF (opcional)
            <input
              value={form.documento}
              onChange={(e) => setForm({ ...form, documento: e.target.value })}
              onBlur={(e) =>
                setForm({ ...form, documento: documentoFormatado(e.target.value.trim()) })
              }
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3 text-base text-stone-900"
            />
          </label>
          {erroDocumento && <p className="text-sm text-red-700">{erroDocumento}</p>}

          <input
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome do cliente"
            className="w-full rounded-lg border border-stone-300 px-3 py-3"
          />
          <select
            value={form.canal}
            onChange={(e) => setForm({ ...form, canal: e.target.value as Canal })}
            className="w-full rounded-lg border border-stone-300 px-3 py-3"
          >
            {Object.entries(ROTULO_CANAL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
          {papel === 'admin' && (
            <select
              required
              value={form.vendedorId}
              onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}
              className="w-full rounded-lg border border-stone-300 px-3 py-3"
            >
              <option value="" disabled>
                Vendedor responsável
              </option>
              {(equipe ?? [])
                .filter((m) => m.papel === 'vendedor' && m.ativo)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
            </select>
          )}
          <div className="flex gap-2">
            <input
              value={form.cidade}
              onChange={(e) => setForm({ ...form, cidade: e.target.value })}
              placeholder="Cidade"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-3"
            />
            <input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              placeholder="WhatsApp"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-3"
            />
          </div>
          <select
            value={form.condicaoPadrao}
            onChange={(e) =>
              setForm({ ...form, condicaoPadrao: e.target.value as CondicaoPagamento })
            }
            className="w-full rounded-lg border border-stone-300 px-3 py-3"
          >
            {Object.entries(ROTULO_CONDICAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
          <label className="block text-sm text-stone-600">
            Compra a cada quantos dias? (opcional — some quando o histórico assumir)
            <input
              type="number"
              min={1}
              value={form.cadenciaDeclaradaDias}
              onChange={(e) => setForm({ ...form, cadenciaDeclaradaDias: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
            />
          </label>
          <label className="block text-sm text-stone-600">
            Prazo do consignado (dias)
            <input
              type="number"
              min={1}
              required
              value={form.prazoConsignadoDias}
              onChange={(e) => setForm({ ...form, prazoConsignadoDias: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Cliente ativo
          </label>
          {salvar.error && <p className="text-sm text-red-700">{salvar.error.message}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={salvar.isPending}
              className="flex-1 rounded-lg bg-amber-800 py-3 font-semibold text-white disabled:opacity-50"
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-lg border border-stone-300 px-4 py-3"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {filtrados.length === 0 ? (
        // busca sem resultado NÃO é carteira vazia. Dizer "nenhum cliente ainda" enquanto
        // existem 30 na lista faz o admin concluir que perdeu a base — foi o que quase
        // aconteceu ao procurar um cliente que a importação ainda não tinha trazido.
        <Vazio
          mensagem={
            busca.trim()
              ? `Nenhum cliente com "${busca.trim()}" no nome. A carteira tem ${(clientes ?? []).length}.`
              : 'Nenhum cliente ainda. Toque em Novo para cadastrar o primeiro.'
          }
        />
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
          {filtrados.map((cliente) => (
            <li key={cliente.id} className="flex items-center justify-between p-4">
              <div>
                <Link to={`/clientes/${cliente.id}`} className="font-medium underline">
                  {cliente.nome}
                </Link>
                <p className="text-sm text-stone-700">
                  {ROTULO_CANAL[cliente.canal]} · {ROTULO_CONDICAO[cliente.condicaoPadrao]}
                  {cliente.ativo ? '' : ' · inativo'}
                </p>
                {janelas.get(cliente.id) && (
                  <SemaforoRecompra janela={janelas.get(cliente.id)!.janela} />
                )}
                {janelas.get(cliente.id)?.estoque && (
                  // estimativa, não inventário: o que sobrou da última compra ao ritmo dele
                  <p className="text-xs tabular-nums text-stone-600">
                    {janelas.get(cliente.id)!.estoque!.acabouHaDias === null
                      ? `≈ ${kgTexto(janelas.get(cliente.id)!.estoque!.kgEstimado)} na prateleira · dá para ${diasTexto(janelas.get(cliente.id)!.estoque!.diasDeCobertura)}`
                      : `prateleira vazia há ${diasTexto(janelas.get(cliente.id)!.estoque!.acabouHaDias!)}`}
                  </p>
                )}
              </div>
              <button onClick={() => abrirEdicao(cliente)} className="text-sm text-stone-700 underline">
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
