import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/componentes/AppShell'
import { RotaProtegida } from '@/componentes/RotaProtegida'
import { ProvedorAuth } from '@/hooks/useAuth'
import Avisos from '@/paginas/Avisos'
import Clientes from '@/paginas/Clientes'
import Comissao from '@/paginas/Comissao'
import Consignado from '@/paginas/Consignado'
import Entregas from '@/paginas/Entregas'
import Equipe from '@/paginas/Equipe'
import FichaCliente from '@/paginas/FichaCliente'
import Hoje from '@/paginas/Hoje'
import Login from '@/paginas/Login'
import Mais from '@/paginas/Mais'
import NasLojas from '@/paginas/NasLojas'
import NovoPedido from '@/paginas/NovoPedido'
import Painel from '@/paginas/Painel'
import Produtos from '@/paginas/Produtos'
import Recompra from '@/paginas/Recompra'
import Relatorio from '@/paginas/Relatorio'
import Romaneio from '@/paginas/Romaneio'
import TabelaPrecos from '@/paginas/TabelaPrecos'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

/** Telas de venda: motorista não entra em nenhuma delas. */
const VENDA = ['admin', 'vendedor'] as const

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProvedorAuth>
        <BrowserRouter>
          <Routes>
            <Route path="/entrar" element={<Login />} />
            {/* fora do AppShell de propósito: romaneio é papel, não tela de app -- sem nav pra esconder na impressão.
                Sem restrição de papel aqui: a RLS decide o que cada um consegue carregar. */}
            <Route
              path="/romaneio/:id"
              element={
                <RotaProtegida>
                  <Romaneio />
                </RotaProtegida>
              }
            />
            <Route
              element={
                <RotaProtegida>
                  {/* A barreira de erro mora DENTRO do AppShell, em volta do <Outlet /> —
                      não aqui. Envolvendo o shell ela o SUBSTITUÍA quando uma tela quebrava,
                      e a navegação de baixo sumia junto: o vendedor ficava na rua com um
                      cartão de erro e nenhum caminho de volta. */}
                  <AppShell />
                </RotaProtegida>
              }
            >
              <Route
                path="/"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <Hoje />
                  </RotaProtegida>
                }
              />
              <Route
                path="/pedido"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <NovoPedido />
                  </RotaProtegida>
                }
              />
              <Route
                path="/clientes"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <Clientes />
                  </RotaProtegida>
                }
              />
              <Route
                path="/clientes/:id"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <FichaCliente />
                  </RotaProtegida>
                }
              />
              {/* relatório que o aviso das 9h abre: quem já devia ter comprado, com nome e atraso */}
              <Route
                path="/recompra"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <Recompra />
                  </RotaProtegida>
                }
              />
              <Route
                path="/consignado"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <Consignado />
                  </RotaProtegida>
                }
              />
              <Route
                path="/entregas"
                element={
                  <RotaProtegida papeis={['admin', 'motorista']}>
                    <Entregas />
                  </RotaProtegida>
                }
              />
              <Route
                path="/painel"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <Painel />
                  </RotaProtegida>
                }
              />
              {/* sem restrição: o próprio menu já mostra só o que o papel acessa */}
              <Route path="/mais" element={<Mais />} />
              {/* aviso é de todo papel — motorista inclusive, é para ele que a carga chega */}
              <Route path="/avisos" element={<Avisos />} />
              <Route
                path="/comissao"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <Comissao />
                  </RotaProtegida>
                }
              />
              <Route
                path="/relatorio"
                element={
                  <RotaProtegida papeis={[...VENDA]}>
                    <Relatorio />
                  </RotaProtegida>
                }
              />
              <Route
                path="/precos"
                element={
                  <RotaProtegida soAdmin>
                    <TabelaPrecos />
                  </RotaProtegida>
                }
              />
              <Route
                path="/produtos"
                element={
                  <RotaProtegida soAdmin>
                    <Produtos />
                  </RotaProtegida>
                }
              />
              <Route
                path="/equipe"
                element={
                  <RotaProtegida soAdmin>
                    <Equipe />
                  </RotaProtegida>
                }
              />
              {/* soAdmin: venda e estoque da rede é dado comercial, não de rua */}
              <Route
                path="/nas-lojas"
                element={
                  <RotaProtegida soAdmin>
                    <NasLojas />
                  </RotaProtegida>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProvedorAuth>
    </QueryClientProvider>
  )
}
