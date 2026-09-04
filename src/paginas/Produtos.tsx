import { useState } from 'react'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import {
  TAMANHO_MAXIMO_BYTES,
  TIPOS_ACEITOS,
  useProdutos,
  useSalvarProduto,
  useUploadFotoProduto,
  type ProdutoInput,
} from '@/hooks/useProdutos'
import { useProdutoCustos, useSalvarProdutoCusto } from '@/hooks/useProdutoCustos'
import { reais } from '@/lib/formato'
import { paraNumero } from '@/lib/numero'
import type { Produto } from '@/lib/tipos'

const VAZIO = { nome: '', descricao: '', pesoKg: '', custo: '', ativo: true, ordem: '0' }

/** Placeholder neutro quando o produto ainda não tem foto — nunca imagem quebrada. */
function FotoPlaceholder({ nome }: { nome: string }) {
  return (
    <div
      role="img"
      aria-label={`${nome} — sem foto cadastrada`}
      className="flex aspect-square w-full items-center justify-center rounded-lg bg-stone-100 text-stone-400"
    >
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden="true">
        <rect x="10" y="16" width="28" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M16 16 V12 a8 8 0 0 1 16 0 v4" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="18" y1="24" x2="30" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function SeloAtivo({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        ativo ? 'bg-green-50 text-green-800' : 'bg-stone-100 text-stone-700'
      }`}
    >
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

export default function Produtos() {
  const { data: produtos, isLoading, error } = useProdutos()
  const { data: custos } = useProdutoCustos()
  const salvar = useSalvarProduto()
  const salvarCusto = useSalvarProdutoCusto()
  const upload = useUploadFotoProduto()

  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(VAZIO)
  const [fotoUrlAtual, setFotoUrlAtual] = useState<string | null>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [erroFoto, setErroFoto] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function abrirNovo() {
    setForm(VAZIO)
    setEditandoId(null)
    setFotoUrlAtual(null)
    setArquivo(null)
    setPreview(null)
    setErroFoto(null)
    setAberto(true)
  }

  function abrirEdicao(produto: Produto) {
    const custo = custos?.[produto.id]
    setForm({
      nome: produto.nome,
      descricao: produto.descricao ?? '',
      pesoKg: String(produto.pesoKg).replace('.', ','),
      // vírgula decimal: é como se digita preço no Brasil, e paraNumero lê de volta
      custo: custo === undefined ? '' : String(custo).replace('.', ','),
      ativo: produto.ativo,
      ordem: String(produto.ordem),
    })
    setEditandoId(produto.id)
    setFotoUrlAtual(produto.fotoUrl)
    setArquivo(null)
    setPreview(null)
    setErroFoto(null)
    setAberto(true)
  }

  function selecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = e.target.files?.[0] ?? null
    setErroFoto(null)
    if (!escolhido) {
      setArquivo(null)
      setPreview(null)
      return
    }
    if (!TIPOS_ACEITOS.includes(escolhido.type)) {
      setErroFoto('Formato de imagem não aceito. Envie um arquivo JPEG, PNG ou WebP.')
      e.target.value = ''
      return
    }
    if (escolhido.size > TAMANHO_MAXIMO_BYTES) {
      setErroFoto('A imagem precisa ter até 2 MB.')
      e.target.value = ''
      return
    }
    setArquivo(escolhido)
    setPreview(URL.createObjectURL(escolhido))
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErroFoto(null)
    const pesoKg = paraNumero(form.pesoKg)
    if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
      setErroFoto('Informe um peso válido, maior que zero (ex.: 0,25).')
      return
    }

    // campo vazio = não mexer no custo (não apaga o que já está cadastrado).
    // Custo 0 é legítimo (brinde, amostra) — por isso a checagem é de texto vazio, não de falsy.
    const temCusto = form.custo.trim() !== ''
    const custo = temCusto ? paraNumero(form.custo) : null
    if (temCusto && (!Number.isFinite(custo as number) || (custo as number) < 0)) {
      setErroFoto('Informe um custo válido, zero ou maior (ex.: 7,50).')
      return
    }

    setEnviando(true)
    try {
      let fotoUrl = fotoUrlAtual
      if (arquivo) {
        fotoUrl = await upload.mutateAsync(arquivo)
      }
      const input: ProdutoInput = {
        id: editandoId ?? undefined,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        pesoKg,
        fotoUrl,
        ativo: form.ativo,
        ordem: paraNumero(form.ordem) || 0,
      }
      const produtoId = await salvar.mutateAsync(input)
      // gravação separada: o custo mora em outra tabela (a que a RLS esconde da equipe).
      // Se esta falhar, o cadastro já salvou e a mensagem diz o que ficou pendente.
      if (custo !== null) {
        await salvarCusto.mutateAsync({ produtoId, custoUnit: custo })
      }
      setAberto(false)
    } catch (e) {
      setErroFoto(e instanceof Error ? e.message : 'Erro ao salvar produto.')
    } finally {
      setEnviando(false)
    }
  }

  if (isLoading) return <Carregando />
  if (error) return <Erro mensagem={error.message} />

  const lista = produtos ?? []

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Produtos</h1>
        <button
          onClick={abrirNovo}
          className="min-h-11 rounded-lg bg-amber-800 px-4 font-semibold text-white"
        >
          Novo produto
        </button>
      </div>

      {aberto && (
        <form onSubmit={enviar} className="mb-4 space-y-3 rounded-xl bg-white p-4 shadow">
          <input
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome do produto"
            className="w-full rounded-lg border border-stone-300 px-3 py-3"
          />
          <textarea
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Descrição (opcional)"
            className="w-full rounded-lg border border-stone-300 px-3 py-3"
          />
          <div className="flex gap-2">
            <label className="flex-1 text-sm text-stone-600">
              Peso (kg)
              <input
                required
                inputMode="decimal"
                value={form.pesoKg}
                onChange={(e) => setForm({ ...form, pesoKg: e.target.value })}
                placeholder="0,25"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
              />
            </label>
            <label className="w-24 text-sm text-stone-600">
              Ordem
              <input
                type="number"
                min={0}
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm text-stone-600">
              Custo (R$ por pacote)
              <input
                inputMode="decimal"
                value={form.custo}
                onChange={(e) => setForm({ ...form, custo: e.target.value })}
                placeholder="7,50"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3"
              />
            </label>
            <p className="mt-1 text-xs text-stone-700">
              Só você vê custo e margem — vendedor e motorista não têm acesso. Cada pedido guarda o
              custo do dia, então reajustar aqui não muda a margem do que já foi vendido.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-stone-600">Foto do produto</label>
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                {preview ? (
                  <img
                    src={preview}
                    alt={`Pré-visualização da foto de ${form.nome || 'produto'}`}
                    className="h-full w-full object-cover"
                  />
                ) : fotoUrlAtual ? (
                  <img
                    src={fotoUrlAtual}
                    alt={`Foto atual de ${form.nome || 'produto'}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <FotoPlaceholder nome={form.nome || 'produto'} />
                )}
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selecionarArquivo}
                className="flex-1 text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-stone-700">JPEG, PNG ou WebP, até 2 MB.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Produto ativo (aparece na hora de lançar pedido)
          </label>

          {erroFoto && <p className="text-sm text-red-700">{erroFoto}</p>}
          {salvar.error && <p className="text-sm text-red-700">{salvar.error.message}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={enviando}
              className="flex-1 rounded-lg bg-amber-800 py-3 font-semibold text-white disabled:opacity-50"
            >
              {enviando ? 'Salvando…' : 'Salvar'}
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

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum produto cadastrado ainda. Toque em Novo produto para criar o primeiro." />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {lista.map((produto) => (
            <button
              key={produto.id}
              onClick={() => abrirEdicao(produto)}
              className="rounded-xl bg-white p-3 text-left shadow"
            >
              {produto.fotoUrl ? (
                <img
                  src={produto.fotoUrl}
                  alt={`Foto do produto ${produto.nome}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ) : (
                <FotoPlaceholder nome={produto.nome} />
              )}
              <p className="mt-2 truncate font-medium">{produto.nome}</p>
              <p className="text-sm text-stone-700">{produto.pesoKg.toLocaleString('pt-BR')} kg</p>
              <p className="text-xs text-stone-600">
                {custos?.[produto.id] === undefined
                  ? 'Sem custo informado'
                  : `Custo ${reais(custos[produto.id])}`}
              </p>
              <div className="mt-1">
                <SeloAtivo ativo={produto.ativo} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
