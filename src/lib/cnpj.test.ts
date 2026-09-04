import { describe, expect, it } from 'vitest'
import {
  cepFormatado,
  cnpjValido,
  cpfValido,
  digitosDoDocumento,
  documentoFormatado,
  emCaixaDeTitulo,
  telefoneEmDigitos,
} from './cnpj'

describe('cnpjValido', () => {
  it('aceita CNPJ com dígito verificador certo', () => {
    expect(cnpjValido('19131243000197')).toBe(true)
    expect(cnpjValido('19.131.243/0001-97')).toBe(true)
  })

  it('recusa dígito trocado — é o erro de digitação que a tela precisa pegar', () => {
    expect(cnpjValido('19131243000198')).toBe(false)
  })

  it('recusa tamanho errado e sequência repetida', () => {
    expect(cnpjValido('1913124300019')).toBe(false)
    expect(cnpjValido('00000000000000')).toBe(false)
    expect(cnpjValido(null)).toBe(false)
  })
})

describe('cpfValido', () => {
  it('separa CPF bom de CPF torto', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224726')).toBe(false)
    expect(cpfValido('11111111111')).toBe(false)
  })
})

describe('formatação', () => {
  it('mostra o documento como o vendedor confere', () => {
    expect(documentoFormatado('19131243000197')).toBe('19.131.243/0001-97')
    expect(documentoFormatado('52998224725')).toBe('529.982.247-25')
  })

  it('formata o CEP e devolve o que não é CEP sem inventar', () => {
    expect(cepFormatado('01311902')).toBe('01311-902')
    expect(cepFormatado(null)).toBe(null)
  })

  it('tira a CAIXA ALTA da Receita sem estragar sigla nem preposição', () => {
    expect(emCaixaDeTitulo('PADARIA DO ZE LTDA')).toBe('Padaria do Ze LTDA')
    expect(emCaixaDeTitulo('MERCADO SAO JOSE ME')).toBe('Mercado Sao Jose ME')
  })

  it('não mexe em texto que alguém já digitou', () => {
    expect(emCaixaDeTitulo('Padaria do Zé')).toBe('Padaria do Zé')
  })

  it('só aceita telefone com DDD — número pela metade no WhatsApp é pior que vazio', () => {
    expect(telefoneEmDigitos('1123851939')).toBe('1123851939')
    expect(telefoneEmDigitos('(34) 99999-0000')).toBe('34999990000')
    expect(telefoneEmDigitos('23851939')).toBe(null)
    expect(telefoneEmDigitos('')).toBe(null)
  })

  it('digitosDoDocumento só devolve tamanho de CPF ou CNPJ', () => {
    expect(digitosDoDocumento('19.131.243/0001-97')).toBe('19131243000197')
    expect(digitosDoDocumento('123')).toBe(null)
  })
})
