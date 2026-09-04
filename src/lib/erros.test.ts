import { describe, expect, it } from 'vitest'
import { mensagemDaResposta, traduzirErro } from './erros'

describe('traduzirErro', () => {
  it('traduz falha de rede para linguagem de gente', () => {
    expect(traduzirErro('TypeError: Failed to fetch').titulo).toContain('Sem conexão')
    expect(traduzirErro('Load failed').titulo).toContain('Sem conexão') // Safari
    expect(traduzirErro('NetworkError when attempting to fetch resource.').titulo).toContain('Sem conexão')
  })

  /**
   * Essa frase é do `FunctionsFetchError` do supabase-js e não casava com nenhum padrão:
   * ia crua, em inglês, para a tela do celular. É o erro mais provável de aparecer no
   * app, porque toda integração com o ERP passa por Edge Function.
   */
  it('traduz a falha de chamada da Edge Function, que vinha em inglês', () => {
    const { titulo, detalhe } = traduzirErro('Failed to send a request to the Edge Function')
    expect(titulo).not.toContain('Edge Function')
    expect(titulo).toContain('não completou')
    // as duas causas possíveis, porque mandar conferir só o sinal esconde a outra
    expect(titulo).toContain('sinal')
    expect(titulo).toContain('demorando')
    expect(detalhe).toBe('Failed to send a request to the Edge Function')
  })

  it('traduz negacao de permissao (RLS)', () => {
    expect(traduzirErro('new row violates row-level security policy for table "precos_faixa"').titulo).toContain(
      'permissão',
    )
  })

  it('traduz sessao expirada e erro de servidor', () => {
    expect(traduzirErro('JWT expired').titulo).toContain('sessão expirou')
    expect(traduzirErro('504 Gateway Timeout').titulo).toContain('servidor')
  })

  it('guarda o texto original como detalhe tecnico', () => {
    expect(traduzirErro('Failed to fetch').detalhe).toBe('Failed to fetch')
  })

  it('mensagem ja em PT-BR passa intacta, sem detalhe duplicado', () => {
    const nossa = 'Só há 3 pacote(s) de saldo nesse cliente.'
    expect(traduzirErro(nossa)).toEqual({ titulo: nossa, detalhe: null })
  })
})

describe('mensagemDaResposta', () => {
  it('pega o campo erro do corpo JSON da Edge Function', () => {
    expect(mensagemDaResposta('{"erro":"Cliente ainda não está atrelado a um parceiro."}')).toBe(
      'Cliente ainda não está atrelado a um parceiro.',
    )
  })

  it('aceita message quando não há erro', () => {
    expect(mensagemDaResposta('{"message":"Sessão inválida"}')).toBe('Sessão inválida')
  })

  it('devolve o texto cru quando não é JSON, em vez de esconder a causa', () => {
    // 502 de gateway devolve HTML; texto feio na tela é ruim, texto nenhum é pior
    expect(mensagemDaResposta('<html>502 Bad Gateway</html>')).toBe('<html>502 Bad Gateway</html>')
  })

  it('devolve o JSON cru quando ele não tem campo de mensagem', () => {
    expect(mensagemDaResposta('{"status":500}')).toBe('{"status":500}')
  })

  it('corpo vazio, só espaço, null ou undefined vira null', () => {
    expect(mensagemDaResposta('')).toBeNull()
    expect(mensagemDaResposta('   ')).toBeNull()
    expect(mensagemDaResposta(null)).toBeNull()
    expect(mensagemDaResposta(undefined)).toBeNull()
  })

  it('não deixa corpo gigante inundar a tela', () => {
    expect(mensagemDaResposta('x'.repeat(1000))?.length).toBe(300)
  })
})
