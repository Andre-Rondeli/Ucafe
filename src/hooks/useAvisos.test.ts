import { describe, expect, it } from 'vitest'
import { destinoDoAviso } from './useAvisos'

describe('destinoDoAviso', () => {
  /**
   * Os avisos de recompra gravados até 27/08/2026 apontam para `/clientes` — a lista de
   * CADASTRO. Tocar na notificação caía na carteira inteira e a pessoa tinha de descobrir
   * sozinha quais eram os clientes atrasados. O tipo vence a url justamente para consertar
   * também os que já estão no banco.
   */
  it('aviso de recompra abre o relatório, mesmo o gravado com a url antiga', () => {
    expect(destinoDoAviso({ tipo: 'recompra', url: '/clientes' })).toBe('/recompra')
    expect(destinoDoAviso({ tipo: 'recompra', url: null })).toBe('/recompra')
  })

  it('os outros avisos continuam indo para onde a função mandou', () => {
    expect(destinoDoAviso({ tipo: 'carga_pronta', url: '/entregas' })).toBe('/entregas')
  })

  it('aviso sem url não quebra o toque — cai na tela inicial', () => {
    expect(destinoDoAviso({ tipo: 'teste', url: null })).toBe('/')
  })
})
