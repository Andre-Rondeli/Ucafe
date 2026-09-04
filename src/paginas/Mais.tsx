import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function Mais() {
  const { papel, sair } = useAuth()
  const vendeOuAdministra = papel === 'admin' || papel === 'vendedor'

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Mais</h1>

      <ul className="mt-4 divide-y divide-stone-200 overflow-hidden rounded-xl bg-white shadow">
        {/* todo papel: é aqui que o motorista liga o aviso no celular dele */}
        <li>
          <Link to="/avisos" className="block min-h-[44px] p-4">
            <p className="font-medium">Avisos</p>
            <p className="text-sm text-stone-700">
              Nota fiscal emitida e carga do dia — e o botão que liga o aviso neste celular.
            </p>
          </Link>
        </li>
        {vendeOuAdministra && (
          <li>
            <Link to="/recompra" className="block min-h-[44px] p-4">
              <p className="font-medium">Na hora de recomprar</p>
              <p className="text-sm text-stone-700">
                Quem já passou da data de repetir o pedido, com o atraso e quanto sugerir.
              </p>
            </Link>
          </li>
        )}
        {vendeOuAdministra && (
          <li>
            <Link to="/painel" className="block min-h-[44px] p-4">
              <p className="font-medium">Painel</p>
              <p className="text-sm text-stone-700">
                A análise completa: vendas, clientes, prazo e mix.
              </p>
            </Link>
          </li>
        )}
        {vendeOuAdministra && (
          <li>
            <Link to="/comissao" className="block min-h-[44px] p-4">
              <p className="font-medium">Comissão</p>
              <p className="text-sm text-stone-700">Veja o que já fechou e o que ainda falta apurar.</p>
            </Link>
          </li>
        )}
        {vendeOuAdministra && (
          <li>
            <Link to="/relatorio" className="block min-h-[44px] p-4">
              <p className="font-medium">Relatório</p>
              <p className="text-sm text-stone-700">Pedidos por período, agrupados por dia, com exportação em CSV.</p>
            </Link>
          </li>
        )}
        {/* Consignado saiu da barra de baixo do admin (deu lugar a Entregas) — mora aqui */}
        {papel === 'admin' && (
          <li>
            <Link to="/consignado" className="block min-h-[44px] p-4">
              <p className="font-medium">Consignado</p>
              <p className="text-sm text-stone-700">Saldo na mão do cliente e o que já venceu o prazo de apuração.</p>
            </Link>
          </li>
        )}
        {papel === 'admin' && (
          <li>
            <Link to="/nas-lojas" className="block min-h-[44px] p-4">
              <p className="font-medium">Nas lojas</p>
              <p className="text-sm text-stone-700">
                Quanto do nosso café saiu em cada loja da Rede Rondelli e quanto ainda tem lá.
              </p>
            </Link>
          </li>
        )}
        {papel === 'admin' && (
          <li>
            <Link to="/produtos" className="block min-h-[44px] p-4">
              <p className="font-medium">Produtos</p>
              <p className="text-sm text-stone-700">Catálogo, foto, peso, custo e ativo/inativo.</p>
            </Link>
          </li>
        )}
        {papel === 'admin' && (
          <li>
            <Link to="/precos" className="block min-h-[44px] p-4">
              <p className="font-medium">Preços</p>
              <p className="text-sm text-stone-700">Tabela de preços por faixa de kg.</p>
            </Link>
          </li>
        )}
        {papel === 'admin' && (
          <li>
            <Link to="/equipe" className="block min-h-[44px] p-4">
              <p className="font-medium">Equipe</p>
              <p className="text-sm text-stone-700">Vendedores, motoristas e administradores do time.</p>
            </Link>
          </li>
        )}
      </ul>

      <button
        onClick={sair}
        className="mt-6 min-h-[44px] w-full rounded-xl border border-red-200 bg-red-50 p-4 text-left"
      >
        <p className="font-medium text-red-800">Sair</p>
        <p className="text-sm text-red-700">Encerrar sua sessão neste aparelho.</p>
      </button>
    </div>
  )
}
