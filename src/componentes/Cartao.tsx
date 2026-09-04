export function Cartao({
  titulo,
  valor,
  detalhe,
  alerta = false,
}: {
  titulo: string
  valor: string
  detalhe?: string
  alerta?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 shadow ${alerta ? 'bg-amber-50' : 'bg-white'}`}>
      <p className="text-xs uppercase tracking-wide text-stone-700">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="mt-1 text-sm text-stone-700">{detalhe}</p>}
    </div>
  )
}
