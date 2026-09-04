import { supabase } from './supabase.ts'
import { mensagemDaResposta } from './erros.ts'

/**
 * Chama uma Edge Function e devolve a mensagem em PT-BR que ela montou.
 *
 * O supabase-js embrulha o HTTP de erro e a `.message` dele é genérica ("Edge Function
 * returned a non-2xx status code"); a mensagem útil está no CORPO, dentro de
 * `error.context`. Em falha de rede não existe `context` nenhum — daí a checagem
 * `instanceof Response` antes de qualquer leitura.
 *
 * Uma cópia só desta tradução: era função privada do hook do AgroFácil e passou a ser
 * compartilhada quando a função `avisos` nasceu. Duas cópias divergiriam justamente na
 * hora em que alguém precisa entender por que a tela disse "erro de rede".
 */
export async function invocarFuncao<T>(
  nome: string,
  corpo: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo })

  if (error) {
    const contexto = (error as { context?: unknown }).context
    if (contexto instanceof Response) {
      const texto = await contexto.text().catch(() => '')
      const mensagem = mensagemDaResposta(texto)
      if (mensagem) throw new Error(mensagem)
    }
    throw new Error(error.message || `Falha ao chamar a função ${nome}.`)
  }

  // 200 com { erro } acontece? Não hoje, mas custa uma linha e evita sucesso silencioso.
  const resposta = (data ?? {}) as { erro?: string }
  if (resposta.erro) throw new Error(resposta.erro)
  return resposta as T
}
