import { Link } from 'react-router-dom'
import { Cartao } from '@/componentes/Cartao'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import { usePendenciasConsignado } from '@/hooks/usePendenciasConsignado'
import { DIAS_ALERTA_CONSIGNADO, situacaoPeloPrazo, type SituacaoConsignado } from '@/lib/consignado'
import { hojeIso } from '@/lib/data'
import { dataLonga, diasTexto, kgTexto } from '@/lib/formato'

const RANK_SITUACAO: Record<SituacaoConsignado, number> = {
  vencido: 0,
  vence_em_breve: 1,
  em_dia: 2,
  sem_prazo: 3,
}

const CLASSE_SELO: Record<SituacaoConsignado, string> = {
  vencido: 'bg-red-50 text-red-800',
  vence_em_breve: 'bg-amber-50 text-amber-900',
  em_dia: 'bg-green-50 text-green-800',
  sem_prazo: 'bg-stone-100 text-stone-700',
}

function textoSelo(situacao: SituacaoConsignado, diasParaPrazo: number | null): string {
  if (situacao === 'vencido') {
    return `Vencido há ${diasTexto(Math.abs(diasParaPrazo ?? 0))}`
  }
  if (situacao === 'vence_em_breve') {
    if (diasParaPrazo === 0) return 'Vence hoje'
    return `Vence em ${diasTexto(diasParaPrazo ?? 0)}`
  }
  if (situacao === 'em_dia') return 'Em dia'
  return 'Sem prazo'
}

/** Ícone + texto sempre juntos — quem não distingue cor ainda lê a situação. */
function IconeSelo({ situacao }: { situacao: SituacaoConsignado }) {
  if (situacao === 'vencido') {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
        <polygon points="10,2 18,17 2,17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="9.25" y="7" width="1.5" height="5" fill="currentColor" />
        <rect x="9.25" y="13.5" width="1.5" height="1.5" fill="currentColor" />
      </svg>
    )
  }
  if (situacao === 'vence_em_breve') {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <line x1="10" y1="10" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="10" y1="10" x2="13" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (situacao === 'em_dia') {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <polyline
          points="6.5,10.2 9,12.7 13.5,7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="6.5" y1="10" x2="13.5" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function Selo({
  situacao,
  diasParaPrazo,
}: {
  situacao: SituacaoConsignado
  diasParaPrazo: number | null
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${CLASSE_SELO[situacao]}`}
    >
      <IconeSelo situacao={situacao} />
      {textoSelo(situacao, diasParaPrazo)}
    </span>
  )
}

function limparWhatsapp(numero: string): string {
  return numero.replace(/\D/g, '')
}

export default function Consignado() {
  const { data: pendencias, isLoading, error } = usePendenciasConsignado()
  const hoje = hojeIso()

  if (isLoading) return <Carregando />
  if (error) return <Erro mensagem={error.message} />

  const linhas = (pendencias ?? [])
    .map((p) => ({ ...p, ...situacaoPeloPrazo(p.prazoRetorno, hoje) }))
    .sort(
      (a, b) =>
        RANK_SITUACAO[a.situacao] - RANK_SITUACAO[b.situacao] ||
        (a.diasParaPrazo ?? 0) - (b.diasParaPrazo ?? 0),
    )

  const vencidos = linhas.filter((l) => l.situacao === 'vencido').length
  const venceEmBreve = linhas.filter((l) => l.situacao === 'vence_em_breve').length
  const emDia = linhas.filter((l) => l.situacao === 'em_dia').length

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Consignado a conferir</h1>
      <p className="mt-1 text-sm text-stone-700">
        Café que está no cliente e ainda não foi apurado. Registre a venda na ficha do cliente.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Cartao titulo="Vencidos" valor={String(vencidos)} alerta={vencidos > 0} />
        <Cartao titulo={`Vencem em ${DIAS_ALERTA_CONSIGNADO} dias`} valor={String(venceEmBreve)} />
        <Cartao titulo="Em dia" valor={String(emDia)} />
      </div>

      {linhas.length === 0 ? (
        <div className="mt-6">
          <Vazio mensagem="Nenhum consignado pendente. Tudo apurado." />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
          {linhas.map((linha) => {
            const whatsappLimpo = linha.whatsapp ? limparWhatsapp(linha.whatsapp) : ''
            return (
              <li key={linha.clienteId} className="flex min-h-[44px] items-center gap-2 p-3">
                <Link to={`/clientes/${linha.clienteId}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{linha.clienteNome}</p>
                  <p className="truncate text-sm tabular-nums text-stone-700">
                    {kgTexto(linha.saldoKg)} ·{' '}
                    {linha.produtos.map((p) => `${p.pacotes} pac. ${p.nome}`).join(' · ')}
                  </p>
                  <p className="text-xs text-stone-600">
                    {linha.prazoRetorno ? `Prazo: ${dataLonga(linha.prazoRetorno)}` : 'Sem prazo definido'}
                  </p>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Selo situacao={linha.situacao} diasParaPrazo={linha.diasParaPrazo} />
                  {whatsappLimpo && (
                    <a
                      href={`https://wa.me/${whatsappLimpo}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-11 items-center rounded-lg border border-stone-300 px-3 text-xs text-stone-600"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
