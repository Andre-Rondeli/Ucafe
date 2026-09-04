/**
 * Traduz erro técnico para o que a equipe leiga consegue agir em cima.
 * Devolve também o texto original quando ele foi traduzido — fica pequeno na tela,
 * é o que o Carlos manda no print quando pede ajuda.
 */
export function traduzirErro(mensagem: string): { titulo: string; detalhe: string | null } {
  const m = mensagem.toLowerCase()

  // "Failed to send a request to the Edge Function" é o `FunctionsFetchError` do
  // supabase-js: o fetch nem completou. Não casava com nenhum padrão daqui, então essa
  // frase em inglês ia crua para a tela — foi o que o Carlos viu em 26/08 no botão de
  // trazer clientes. Ela tem DUAS causas e a mensagem precisa dar conta das duas: sinal
  // ruim no celular, ou a função demorando mais do que a conexão aguenta.
  if (/failed to send a request/.test(m)) {
    return {
      titulo:
        'A chamada não completou. Pode ser sinal fraco ou a operação estar demorando demais — tente de novo com uma conexão melhor.',
      detalhe: mensagem,
    }
  }
  if (/failed to fetch|networkerror|load failed|fetch failed|network request failed|err_internet|err_network/.test(m)) {
    return { titulo: 'Sem conexão com a internet. Confira o sinal e tente de novo.', detalhe: mensagem }
  }
  if (/row-level security|42501|permission denied|not allowed/.test(m)) {
    return { titulo: 'Você não tem permissão para essa ação. Fale com o administrador.', detalhe: mensagem }
  }
  if (/jwt|token|refresh_token|sessão inválida|session/.test(m)) {
    return { titulo: 'Sua sessão expirou. Saia e entre de novo.', detalhe: mensagem }
  }
  if (/50[0-4]|internal server error|bad gateway|service unavailable|timeout|timed out/.test(m)) {
    return { titulo: 'O servidor demorou a responder. Espere um instante e tente de novo.', detalhe: mensagem }
  }
  // mensagem já em PT-BR (as nossas) passa direto, sem detalhe duplicado
  return { titulo: mensagem, detalhe: null }
}

/**
 * Mensagem de erro vinda do CORPO de uma resposta de Edge Function.
 *
 * O supabase-js embrulha o HTTP de erro num `FunctionsHttpError` cuja `.message` é
 * genérica ("Edge Function returned a non-2xx status code") — a mensagem em PT-BR que a
 * função montou está no corpo. Ler o corpo como TEXTO e só então tentar o JSON: chamar
 * `.json()` num corpo que não é JSON estoura e mascara a causa real, que foi exatamente
 * o que aconteceu quando o CORS derrubou o cadastro de pessoa.
 *
 * Corpo que não é JSON volta como texto cru em vez de virar null: texto feio na tela é
 * ruim, texto nenhum é pior — vira "erro desconhecido" e ninguém consegue ajudar.
 */
export function mensagemDaResposta(texto: string | null | undefined): string | null {
  const cru = (texto ?? '').trim()
  if (!cru) return null
  try {
    const corpo = JSON.parse(cru) as { erro?: unknown; message?: unknown } | null
    for (const campo of [corpo?.erro, corpo?.message]) {
      if (typeof campo === 'string' && campo.trim()) return campo.trim()
    }
    return cru.slice(0, 300)
  } catch {
    return cru.slice(0, 300)
  }
}
