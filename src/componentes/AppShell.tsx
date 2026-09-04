import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarreiraErro } from '@/componentes/BarreiraErro'
import { useAuth, type Papel } from '@/hooks/useAuth'
import { naoLidos, useAvisos } from '@/hooks/useAvisos'
import { MARCA } from '@/lib/marca'

// nav inferior tem no máximo 5 itens (limite de leitura no celular); o resto
// (Painel, admin e ação de sair) mora dentro de "Mais".
// Admin troca Consignado por Entregas na barra — Consignado segue no menu Mais e na
// Ficha do Cliente. Motorista tem só Entregas: é a única tela dele.
const ABAS_POR_PAPEL: Record<Papel, { para: string; rotulo: string }[]> = {
  admin: [
    { para: '/', rotulo: 'Hoje' },
    { para: '/pedido', rotulo: 'Pedido' },
    { para: '/clientes', rotulo: 'Clientes' },
    { para: '/entregas', rotulo: 'Entregas' },
  ],
  vendedor: [
    { para: '/', rotulo: 'Hoje' },
    { para: '/pedido', rotulo: 'Pedido' },
    { para: '/clientes', rotulo: 'Clientes' },
    { para: '/consignado', rotulo: 'Consignado' },
  ],
  motorista: [{ para: '/entregas', rotulo: 'Entregas' }],
}

const ROTAS_DENTRO_DE_MAIS = [
  '/recompra',
  '/painel',
  '/comissao',
  '/relatorio',
  '/consignado',
  '/precos',
  '/produtos',
  '/equipe',
  '/avisos',
]

const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Admin',
  vendedor: 'Vendedor',
  motorista: 'Motorista',
}

export function AppShell() {
  const { nome, papel, sair } = useAuth()
  const { data: avisos } = useAvisos()
  const { pathname } = useLocation()
  const maisAtivo = pathname === '/mais' || ROTAS_DENTRO_DE_MAIS.some((rota) => pathname.startsWith(rota))

  // papel ainda carregando: usa as abas de vendedor como neutro (nenhuma é exclusiva de admin)
  const abas = ABAS_POR_PAPEL[papel ?? 'vendedor']
  // motorista não tem "Mais": nada lá dentro é dele, e Sair já está no cabeçalho
  const mostraMais = papel !== 'motorista'
  const colunas = abas.length + (mostraMais ? 1 : 0)
  const pendentes = naoLidos(avisos)

  return (
    /*
     * A barra de baixo é IRMÃ da área que rola, não um elemento `fixed` por cima dela.
     *
     * Com `position: fixed` + `pb-16` a barra dependia de o navegador respeitar o
     * viewport durante a rolagem — e no celular ela aparecia no meio da tela. Aqui o
     * app tem a altura do viewport (`h-dvh`, que já desconta a barra do navegador no
     * celular), o conteúdo rola dentro do miolo e a nav fica FORA desse miolo: não
     * existe rolagem que a leve embora, porque ela não está no que rola.
     *
     * `dvh` e não `vh`: no iOS, `100vh` é maior que a tela visível e empurraria a barra
     * para baixo do fim da tela. O cabeçalho fica dentro do miolo de propósito — ele
     * rola junto e devolve espaço de leitura, como era antes.
     */
    <div className="flex h-dvh flex-col bg-stone-50 text-stone-900">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
          <div>
            {/* Nome em texto, e não imagem: assim trocar a marca é editar src/lib/marca.ts.
                Para usar uma logo, ponha o arquivo em public/icones/ e troque este <p> por
                um <img> com width e height fixos (sem eles o cabeçalho pula no carregamento). */}
            <p className="text-lg font-bold tracking-tight text-amber-900">{MARCA}</p>
            {nome && (
              <p className="text-xs text-stone-600">
                {nome}
                {papel && ` · ${ROTULO_PAPEL[papel]}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* sino em toda tela: aviso de NF e de carga não pode depender de a pessoa
                lembrar de abrir um menu */}
            <Link
              to="/avisos"
              aria-label={
                pendentes > 0 ? `Avisos, ${pendentes} não lido(s)` : 'Avisos'
              }
              className="relative flex h-11 w-11 items-center justify-center"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                <path
                  d="M12 3a5 5 0 0 0-5 5v3.5L5.5 15h13L17 11.5V8a5 5 0 0 0-5-5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 18a2 2 0 0 0 4 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {pendentes > 0 && (
                <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
                  {pendentes > 9 ? '9+' : pendentes}
                </span>
              )}
            </Link>
            <button onClick={sair} className="min-h-11 text-sm text-stone-700 underline">
              Sair
            </button>
          </div>
        </header>

        {/*
          A barreira fica AQUI, em volta do miolo: tela que quebra vira um cartão de erro e
          o cabeçalho e a navegação de baixo continuam de pé — quem está na rua troca de aba
          e segue trabalhando.

          `key={pathname}` porque barreira de erro guarda o erro em state e não zera sozinha:
          sem a key, trocar de aba mostraria o erro da tela anterior na tela nova. Mudar a key
          remonta o componente, e é isso que limpa o estado.
        */}
        <main className="mx-auto max-w-3xl">
          <BarreiraErro key={pathname}>
            <Outlet />
          </BarreiraErro>
        </main>
      </div>

      {/* colunas variam com o papel (motorista tem 1 aba) -- grid-cols fixo deixaria a aba estreita num canto */}
      <nav
        className="grid shrink-0 border-t border-stone-200 bg-white"
        style={{
          gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`,
          // iPhone com barra de gestos: sem isto o rótulo fica embaixo do risquinho.
          // Vale 0 em aparelho sem inset, então não sobra espaço em ninguém.
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {abas.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            end={aba.para === '/'}
            className={({ isActive }) =>
              `px-1 py-3 text-center text-sm ${isActive ? 'font-semibold text-amber-800' : 'text-stone-700'}`
            }
          >
            {aba.rotulo}
          </NavLink>
        ))}
        {mostraMais && (
          <Link
            to="/mais"
            className={`px-1 py-3 text-center text-sm ${maisAtivo ? 'font-semibold text-amber-800' : 'text-stone-700'}`}
          >
            Mais
          </Link>
        )}
      </nav>
    </div>
  )
}
