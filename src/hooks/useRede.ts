import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { JANELA_DIAS, resumirPorLoja, type LinhaEspelho, type ResumoDeLoja } from '@/lib/rede'

/**
 * Dias que a tela carrega: a janela de 30 mais uma folga de 15.
 *
 * A folga existe porque a janela é ancorada no último dia COM VENDA, não em hoje. Se a
 * carga do Consinco atrasar três dias, a janela de 30 dias termina três dias atrás e
 * começa 33 dias atrás — sem folga, o começo dela ficaria fora do que foi carregado e a
 * venda apareceria menor do que é.
 */
const DIAS_CARREGADOS = JANELA_DIAS + 15

/** Teto duro do PostgREST por requisição. `.limit()` acima disso NÃO levanta o teto. */
const PAGINA = 1000

export type UltimaSincronia = {
  em: string
  resultado: 'ok' | 'erro' | 'recusado_vazio'
  linhasGravadas: number | null
  detalhe: string | null
}

export type VisaoDaRede = {
  lojas: ResumoDeLoja[]
  /** As linhas cruas, para o gráfico por loja montar a série sem uma segunda ida ao banco. */
  linhas: LinhaEspelho[]
  /** Dia mais recente com venda no espelho — é o que a tela carimba. */
  diaDoDado: string | null
  ultimaSincronia: UltimaSincronia | null
}

function diasAtras(dias: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Lê `rede_dia` inteira dentro da janela, paginando.
 *
 * Sem a paginação o PostgREST devolveria no máximo 1.000 linhas e PARARIA AÍ, sem erro e
 * sem aviso — a tela mostraria menos venda do que houve e ninguém saberia por quê. Hoje a
 * janela cabe folgada em uma página; o laço existe para o dia em que a indústria tiver
 * mais produtos.
 */
async function lerEspelho(desde: string): Promise<LinhaEspelho[]> {
  const linhas: LinhaEspelho[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('rede_dia')
      .select(
        'dia, loja_codigo, loja_nome, loja_tipo, uf, produto_codigo, produto_nome, venda_qtd, venda_valor, estoque_qtd',
      )
      .gte('dia', desde)
      .order('dia')
      .order('loja_codigo')
      .order('produto_codigo')
      .range(inicio, inicio + PAGINA - 1)
    if (error) throw new Error(error.message)
    const pagina = (data ?? []) as LinhaEspelho[]
    linhas.push(...pagina)
    if (pagina.length < PAGINA) return linhas
  }
}

export function useRede() {
  return useQuery({
    queryKey: ['rede'],
    queryFn: async (): Promise<VisaoDaRede> => {
      const [linhas, sincronia] = await Promise.all([
        lerEspelho(diasAtras(DIAS_CARREGADOS)),
        supabase
          .from('rede_sync_execucoes')
          .select('em, resultado, linhas_gravadas, detalhe')
          .order('em', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const lojas = resumirPorLoja(linhas)
      const diaDoDado = lojas.reduce<string | null>((maior, l) => {
        if (!l.ultimoDiaComVenda) return maior
        return maior === null || l.ultimoDiaComVenda > maior ? l.ultimoDiaComVenda : maior
      }, null)

      const s = sincronia.data as {
        em: string
        resultado: UltimaSincronia['resultado']
        linhas_gravadas: number | null
        detalhe: string | null
      } | null

      return {
        lojas,
        linhas,
        diaDoDado,
        ultimaSincronia: s
          ? { em: s.em, resultado: s.resultado, linhasGravadas: s.linhas_gravadas, detalhe: s.detalhe }
          : null,
      }
    },
    // o espelho muda uma vez por dia; não faz sentido reconsultar a cada foco de tela
    staleTime: 5 * 60_000,
  })
}

/**
 * Roda a sincronia agora, sem esperar as 6h30.
 *
 * Existe porque a alternativa é o admin ficar sem saber se a busca da manhã funcionou até
 * a manhã seguinte. A Edge é a mesma que o cron chama — nenhum caminho paralelo.
 */
export function useSincronizarRede() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{ linhas_gravadas: number }> => {
      const { data, error } = await supabase.functions.invoke('processdesk', {
        body: { acao: 'sincronizar' },
      })
      if (error) {
        // O corpo do erro da Edge traz a mensagem em português (ex.: a trava de
        // completude). Sem lê-lo, a tela mostraria só "Edge Function returned a non-2xx".
        const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error((corpo as { erro?: string } | null)?.erro ?? error.message)
      }
      return data as { linhas_gravadas: number }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rede'] }),
  })
}
