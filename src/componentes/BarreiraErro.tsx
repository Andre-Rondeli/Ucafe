import { Component, type ErrorInfo, type ReactNode } from 'react'
import { traduzirErro } from '@/lib/erros'

/**
 * Barreira de erro. Existe por causa de uma tela branca em produção: a resposta de uma
 * Edge Function chegou sem um campo, a tela fez `data.nomes.length`, e o `undefined.length`
 * derrubou o React inteiro — app apagado, sem mensagem, sem caminho de volta.
 *
 * A causa daquele caso foi corrigida, mas a lição não é sobre aquele campo: é que UM erro
 * de leitura em UMA tela não pode apagar o app na mão do vendedor no meio da rua. Aqui ele
 * vira uma tela com o que aconteceu e um botão de recomeçar.
 *
 * Precisa ser classe: só componente de classe recebe `componentDidCatch`. Não é código
 * legado, é a única forma que o React oferece.
 */
interface Props {
  children: ReactNode
}

interface Estado {
  erro: Error | null
}

export class BarreiraErro extends Component<Props, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // fica no console do aparelho: é o que o Carlos manda no print quando pede ajuda
    console.error('Tela quebrou:', erro.message, info.componentStack)
  }

  render() {
    const { erro } = this.state
    if (!erro) return this.props.children

    const { titulo, detalhe } = traduzirErro(erro.message)

    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-900">Esta tela travou.</p>
          <p className="mt-1 text-sm text-red-800">{titulo}</p>
          <p className="mt-2 text-xs text-red-700">
            Nada foi perdido: o que já estava salvo continua salvo. Volte e tente de novo — se
            repetir, mande este texto para quem cuida do sistema.
          </p>
          {detalhe && (
            <p className="mt-2 break-words font-mono text-xs text-red-600">{detalhe}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ erro: null })}
              className="min-h-[44px] rounded-lg bg-red-800 px-4 text-sm font-semibold text-white"
            >
              Tentar de novo
            </button>
            <button
              type="button"
              // recarrega na raiz: sai de uma rota que quebra de forma repetida
              onClick={() => {
                window.location.href = '/'
              }}
              className="min-h-[44px] rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-800"
            >
              Ir para o início
            </button>
          </div>
        </div>
      </div>
    )
  }
}
