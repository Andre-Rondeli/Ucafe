import { traduzirErro } from '@/lib/erros'

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <p className="p-6 text-center text-sm text-stone-700">{texto}</p>
}

export function Erro({ mensagem }: { mensagem: string }) {
  const { titulo, detalhe } = traduzirErro(mensagem)
  return (
    <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-medium">Algo deu errado</p>
      <p>{titulo}</p>
      {detalhe && <p className="mt-2 text-xs text-red-700/70">Detalhe técnico: {detalhe}</p>}
    </div>
  )
}

export function Vazio({ mensagem }: { mensagem: string }) {
  return <p className="p-8 text-center text-sm text-stone-700">{mensagem}</p>
}
