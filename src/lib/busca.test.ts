import { describe, expect, it } from 'vitest'
import { filtrarPorTexto, normalizar } from './busca'

interface Linha {
  nome: string
  cidade: string | null
}

const LISTA: Linha[] = [
  { nome: 'Padaria do Zé', cidade: 'Itabuna' },
  { nome: 'Hotel São Gabriel', cidade: 'Ilhéus' },
  { nome: 'Mercado Central', cidade: null },
  { nome: 'LOJA 012', cidade: 'Eunápolis' },
]

const campos = (l: Linha) => [l.nome, l.cidade]

describe('normalizar', () => {
  it('tira acento e caixa', () => {
    expect(normalizar('São Gabriel')).toBe('sao gabriel')
    expect(normalizar('ILHÉUS')).toBe('ilheus')
    expect(normalizar('Eunápolis')).toBe('eunapolis')
  })

  it('aguenta nulo e vazio sem estourar', () => {
    expect(normalizar(null)).toBe('')
    expect(normalizar(undefined)).toBe('')
    expect(normalizar('   ')).toBe('')
  })

  it('preserva o ç como c, não apaga a letra', () => {
    expect(normalizar('Iguaçu')).toBe('iguacu')
  })
})

describe('filtrarPorTexto', () => {
  it('termo vazio devolve a lista inteira — busca é atalho, não portão', () => {
    expect(filtrarPorTexto(LISTA, '', campos)).toHaveLength(4)
    expect(filtrarPorTexto(LISTA, '   ', campos)).toHaveLength(4)
  })

  it('acha sem acento o que está cadastrado com acento', () => {
    expect(filtrarPorTexto(LISTA, 'sao gabriel', campos).map((l) => l.nome)).toEqual([
      'Hotel São Gabriel',
    ])
    expect(filtrarPorTexto(LISTA, 'ilheus', campos)).toHaveLength(1)
  })

  it('acha pela cidade, não só pelo nome', () => {
    expect(filtrarPorTexto(LISTA, 'itabuna', campos).map((l) => l.nome)).toEqual([
      'Padaria do Zé',
    ])
  })

  it('junta palavras de campos diferentes e fora de ordem', () => {
    expect(filtrarPorTexto(LISTA, 'itabuna ze', campos).map((l) => l.nome)).toEqual([
      'Padaria do Zé',
    ])
    expect(filtrarPorTexto(LISTA, 'ze itabuna', campos).map((l) => l.nome)).toEqual([
      'Padaria do Zé',
    ])
  })

  it('cidade nula não derruba a busca pelo nome', () => {
    expect(filtrarPorTexto(LISTA, 'central', campos).map((l) => l.nome)).toEqual([
      'Mercado Central',
    ])
  })

  it('acha loja pelo número, que é como a rede chama', () => {
    expect(filtrarPorTexto(LISTA, '012', campos).map((l) => l.nome)).toEqual(['LOJA 012'])
  })

  it('sem resultado devolve lista vazia, não a lista toda', () => {
    expect(filtrarPorTexto(LISTA, 'xyz', campos)).toEqual([])
  })
})
