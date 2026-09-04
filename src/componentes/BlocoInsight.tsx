import { Vazio } from './Estado'
import { dataCurta, diasTexto, kgTexto } from '@/lib/formato'
import type { LinhaCliente } from '@/lib/insights'
import type { Sinal } from '@/lib/recompra'

const ROTULO_SINAL: Record<Sinal, { texto: string; classe: string }> = {
  na_hora: { texto: 'Na hora de recomprar', classe: 'bg-amber-100 text-amber-900' },
  em_risco: { texto: 'Em risco', classe: 'bg-red-100 text-red-900' },
  caindo: { texto: 'Caindo', classe: 'bg-orange-100 text-orange-900' },
  novo: { texto: 'Novo — acompanhar', classe: 'bg-stone-100 text-stone-700' },
  ok: { texto: 'Em dia', classe: 'bg-emerald-100 text-emerald-900' },
}

const ROTULO_CONFIANCA: Record<LinhaCliente['previsao']['confianca'], string> = {
  sem_historico: 'sem histórico',
  baixa: 'confiança baixa',
  media: 'confiança média',
  alta: 'confiança alta',
}

export const SINAIS_DE_ACAO: Sinal[] = ['na_hora', 'em_risco', 'caindo']

export function BlocoInsight({ linhas }: { linhas: LinhaCliente[] }) {
  // um cliente com cadência declarada aparece como `novo` E `na_hora` ao mesmo tempo:
  // o que decide a fila é ter sinal de ação, não a ausência de `novo`
  const temAcao = (linha: LinhaCliente) =>
    linha.sinais.some((sinal) => SINAIS_DE_ACAO.includes(sinal))
  const prioritarias = linhas.filter(temAcao)
  const novos = linhas.filter((linha) => linha.sinais.includes('novo') && !temAcao(linha))

  return (
    <section className="space-y-3">
      <div>
        <h2 className="mb-1 font-semibold">Quem ligar agora</h2>
        <p className="text-sm text-stone-700">
          Ordenado pelos mais atrasados. A previsão vem do histórico de pedidos.
        </p>
      </div>

      {prioritarias.length === 0 ? (
        <Vazio mensagem="Ninguém atrasado — todos dentro da cadência." />
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl bg-white shadow">
          {prioritarias.map((linha) => (
            <li key={linha.clienteId} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{linha.clienteNome}</p>
                  <p className="text-sm tabular-nums text-stone-700">
                    Última compra {dataCurta(linha.ultimaCompra)} · {kgTexto(linha.kgUltimo)}
                    {linha.previsao.cadenciaDias !== null &&
                      ` · a cada ${diasTexto(linha.previsao.cadenciaDias)}`}
                  </p>
                  <p className="text-xs tabular-nums text-stone-600">
                    {ROTULO_CONFIANCA[linha.previsao.confianca]}
                    {linha.previsao.origemCadencia === 'declarada' && ' · cadência informada'}
                    {linha.previsao.qtdSugeridaKg !== null &&
                      ` · sugerir ${kgTexto(linha.previsao.qtdSugeridaKg)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {linha.sinais.map((sinal) => (
                    <span
                      key={sinal}
                      className={`rounded-full px-2 py-0.5 text-xs ${ROTULO_SINAL[sinal].classe}`}
                    >
                      {ROTULO_SINAL[sinal].texto}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {novos.length > 0 && (
        <p className="text-sm text-stone-700">
          {novos.length} cliente(s) sem histórico suficiente para prever:{' '}
          {novos.map((linha) => linha.clienteNome).join(', ')}.
        </p>
      )}
    </section>
  )
}
