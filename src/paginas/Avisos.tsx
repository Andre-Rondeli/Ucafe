import { Link } from 'react-router-dom'
import { Carregando, Erro, Vazio } from '@/componentes/Estado'
import {
  destinoDoAviso,
  naoLidos,
  useAvisos,
  useDesinscreverPush,
  useEstadoPush,
  useInscreverPush,
  useMarcarAvisoLido,
  useMarcarTodosLidos,
  useTestarPush,
} from '@/hooks/useAvisos'
import { dataLonga, horaCurta } from '@/lib/formato'
import { MARCA } from '@/lib/marca'

/**
 * Avisos: a carga de uma rota fica pronta (ou cresce) e a hora de recomprar.
 *
 * Um aviso por ROTA, não um por cliente ou nota fiscal — e só enquanto aquela carga não
 * foi concluída. Rota já entregue não manda mais nada. O aviso vive no banco e aparece
 * aqui de qualquer jeito. O push é a ENTREGA dele no celular — quem não aceitou
 * notificação continua vendo tudo nesta tela, e é por isso que recusar a permissão não
 * perde informação.
 */

function BlocoPush() {
  const { data: estado } = useEstadoPush()
  const inscrever = useInscreverPush()
  const desinscrever = useDesinscreverPush()
  const testar = useTestarPush()

  if (!estado) return null

  if (!estado.suportado) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="font-medium">Aviso no celular</p>
        <p className="mt-1 text-sm text-stone-700">
          Este navegador não recebe aviso. No iPhone, instale o {MARCA} na Tela de Início
          (Compartilhar → Adicionar à Tela de Início) e abra por lá — é a única forma de a
          Apple deixar o aviso chegar.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Aviso no celular</p>
          <p className="mt-1 text-sm text-stone-700">
            {estado.inscrito
              ? 'Ligado neste aparelho. A carga da rota chega mesmo com o app fechado.'
              : 'Desligado neste aparelho. Ligue para receber o aviso da carga da rota.'}
          </p>
          {!estado.temServiceWorker && (
            <p className="mt-1 text-xs text-amber-800">
              Neste ambiente o aviso não funciona (o service worker só roda no app publicado).
            </p>
          )}
          {estado.permissao === 'denied' && (
            <p className="mt-1 text-xs text-amber-800">
              O aviso está bloqueado no navegador. Libere em Ajustes → Notificações → {MARCA}.
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={inscrever.isPending || desinscrever.isPending}
          onClick={() => (estado.inscrito ? desinscrever.mutate() : inscrever.mutate())}
          className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${
            estado.inscrito ? 'border border-stone-300' : 'bg-amber-800 text-white'
          }`}
        >
          {inscrever.isPending || desinscrever.isPending
            ? 'Salvando…'
            : estado.inscrito
              ? 'Desligar'
              : 'Ligar aviso'}
        </button>
      </div>

      {estado.inscrito && (
        <button
          type="button"
          disabled={testar.isPending}
          onClick={() => testar.mutate()}
          className="mt-3 min-h-11 w-full rounded-lg border border-stone-300 text-sm font-semibold disabled:opacity-50"
        >
          {testar.isPending ? 'Mandando…' : 'Mandar um aviso de teste para este celular'}
        </button>
      )}

      {inscrever.error && <p className="mt-2 text-sm text-red-700">{inscrever.error.message}</p>}
      {desinscrever.error && (
        <p className="mt-2 text-sm text-red-700">{desinscrever.error.message}</p>
      )}
      {testar.error && <p className="mt-2 text-sm text-red-700">{testar.error.message}</p>}
      {testar.data && (
        <p className="mt-2 text-sm text-stone-700">
          {testar.data.enviados > 0
            ? 'Aviso de teste enviado — deve aparecer no celular em alguns segundos.'
            : `Não saiu: ${(testar.data.motivos ?? []).join(' · ') || 'sem motivo informado'}`}
        </p>
      )}
    </div>
  )
}

export default function Avisos() {
  const { data: avisos, isLoading, error } = useAvisos()
  const marcar = useMarcarAvisoLido()
  const marcarTodos = useMarcarTodosLidos()

  if (isLoading) return <Carregando texto="Carregando os avisos…" />
  if (error) return <Erro mensagem={error.message} />

  const lista = avisos ?? []
  const pendentes = naoLidos(lista)

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Avisos</h1>
        {pendentes > 0 && (
          <button
            type="button"
            onClick={() => marcarTodos.mutate()}
            className="min-h-11 text-sm text-stone-700 underline"
          >
            Marcar todos como lidos
          </button>
        )}
      </div>

      <BlocoPush />

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum aviso ainda. Quando a carga de uma rota ficar pronta, ela aparece aqui." />
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
          {lista.map((aviso) => (
            <li key={aviso.id} className={aviso.lidoEm ? 'bg-stone-50' : ''}>
              <Link
                to={destinoDoAviso(aviso)}
                onClick={() => {
                  if (!aviso.lidoEm) marcar.mutate(aviso.id)
                }}
                className="block p-3"
              >
                <div className="flex items-start gap-2">
                  {!aviso.lidoEm && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-700" />
                  )}
                  <div className="min-w-0">
                    <p className={`font-medium ${aviso.lidoEm ? 'text-stone-600' : ''}`}>
                      {aviso.titulo}
                    </p>
                    <p className="text-sm text-stone-700">{aviso.corpo}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {dataLonga(aviso.criadoEm.slice(0, 10))} às {horaCurta(aviso.criadoEm)}
                      {aviso.enviadoEm === null && ' · ainda não saiu no celular'}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
