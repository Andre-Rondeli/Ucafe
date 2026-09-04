import { describe, expect, it } from 'vitest'
import { arredondar2, paraNumero, precoDigitado } from './numero'

describe('arredondar2', () => {
  it('arredonda para 2 casas', () => {
    expect(arredondar2(10.456)).toBe(10.46)
    expect(arredondar2(10.454)).toBe(10.45)
  })

  it('resolve o erro classico de ponto flutuante', () => {
    expect(arredondar2(0.1 + 0.2)).toBe(0.3)
    expect(arredondar2(1.005)).toBe(1.01)
  })

  it('preserva inteiros e zero', () => {
    expect(arredondar2(0)).toBe(0)
    expect(arredondar2(7)).toBe(7)
  })
})

describe('paraNumero', () => {
  it('aceita vírgula decimal (formato brasileiro)', () => {
    expect(paraNumero('11,00')).toBe(11)
    expect(paraNumero('8,70')).toBe(8.7)
  })

  it('aceita ponto decimal', () => {
    expect(paraNumero('11.00')).toBe(11)
    expect(paraNumero('11')).toBe(11)
    expect(paraNumero('0')).toBe(0)
  })

  it('ignora espaços em volta', () => {
    expect(paraNumero(' 12,5 ')).toBe(12.5)
  })

  it('trata ponto como separador de milhar quando há vírgula decimal', () => {
    expect(paraNumero('1.234,56')).toBe(1234.56)
  })

  it('sem vírgula, ponto é sempre decimal — mesmo com mais de 2 casas', () => {
    expect(paraNumero('50.001')).toBe(50.001)
  })

  it('devolve NaN para string vazia ou lixo', () => {
    expect(paraNumero('')).toBeNaN()
    expect(paraNumero('abc')).toBeNaN()
    expect(paraNumero('12,3,4')).toBeNaN()
  })

  it('aceita negativo', () => {
    expect(paraNumero('-5,5')).toBe(-5.5)
  })
})

describe('precoDigitado', () => {
  it('aceita virgula decimal, que e como se digita preco no Brasil', () => {
    expect(precoDigitado('11,00')).toEqual({ valor: 11, erro: null })
    expect(precoDigitado('10,50')).toEqual({ valor: 10.5, erro: null })
    expect(precoDigitado('1.234,56')).toEqual({ valor: 1234.56, erro: null })
  })

  it('campo vazio nao e erro: significa "sem ajuste"', () => {
    expect(precoDigitado('')).toEqual({ valor: null, erro: null })
    expect(precoDigitado('   ')).toEqual({ valor: null, erro: null })
  })

  it('texto que nao e preco devolve erro em vez de cair calado na tabela', () => {
    // era aqui que o pedido salvava no preco cheio achando que tinha desconto
    expect(precoDigitado('abc').valor).toBeNull()
    expect(precoDigitado('abc').erro).toContain('não é um preço')
    expect(precoDigitado('11,0,0').erro).toContain('não é um preço')
  })

  it('recusa zero e negativo', () => {
    expect(precoDigitado('0').erro).toContain('maior que zero')
    expect(precoDigitado('-5').erro).toContain('maior que zero')
  })

  it('arredonda para centavo', () => {
    expect(precoDigitado('10,999')).toEqual({ valor: 11, erro: null })
  })
})
