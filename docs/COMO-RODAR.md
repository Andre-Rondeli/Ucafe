# Como rodar

App de vendas da Ucafé: lança pedido com preço automático por faixa de volume, acompanha
recompra e consignado, e mostra os produtos da Ucafé nas lojas da Rede Rondelli.

Visão geral do que existe: [../LEIA-PRIMEIRO.md](../LEIA-PRIMEIRO.md).

## Rodar local

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. **Antes precisa do `.env`** — sem ele o app carrega mas
nada responde, e o console diz exatamente isso.

## Passo a passo da primeira vez

### 1. Projeto no Supabase

Crie em [supabase.com](https://supabase.com) (o plano gratuito serve para começar).
Anote de **Project Settings → API**:

- a **URL** (`https://xxxx.supabase.co`)
- a **publishable key** (também chamada de `anon`)
- o **ref** do projeto (o `xxxx` da URL) — vai no `.github/workflows/ci.yml`

### 2. Aplicar as migrations

**Na ordem do nome do arquivo**, uma a uma, no SQL Editor do dashboard:

```
supabase/migrations/20260803120000_init_torrao.sql
supabase/migrations/20260803130000_rpc_criar_pedido.sql
... (29 no total)
```

Ou, com a CLI do Supabase instalada e o projeto linkado:

```bash
npx supabase db push
```

Ordem importa: uma migration altera o que a anterior criou. Depois de aplicar, confira o
objeto vivo — a tabela existe? a policy existe? — antes de considerar feito. Registro de
migration não é prova; objeto vivo é. Ver `supabase/APLICADAS.md`.

**Passo obrigatório logo depois**, senão nenhuma rotina automática roda:

```sql
update rotina_config set
  url_base = 'https://SEU-PROJETO.supabase.co',
  anon_key = 'COLE-A-PUBLISHABLE-KEY-AQUI';
```

### 3. `.env`

```bash
cp .env.example .env
```

E preencha com a URL e a publishable key do passo 1.

A chave anon é pública por natureza — o Vite embute qualquer `VITE_*` no bundle, então ela
já é legível por qualquer visitante do site. **Quem protege o dado é a RLS**, não o segredo
da chave. A `service_role` nunca entra aqui.

### 4. Primeiro usuário

Dashboard → Authentication → Users → **Add user** (com e-mail e senha).

Depois, no SQL Editor, promova a admin:

```sql
update profiles set papel = 'admin', ativo = true
where id = (select id from auth.users where email = 'voce@suaempresa.com');
```

**Desligue o cadastro público** em Authentication → Providers → "Allow new users to sign
up". Senão qualquer pessoa se registra e lê sua tabela de preços. Daí em diante, gente nova
se cria dentro do app, em **Mais → Equipe**.

### 5. Publicar

Suba o código para um repositório GitHub e importe na [Vercel](https://vercel.com) — ela
detecta Vite sozinha.

Cadastre no painel da Vercel as mesmas duas variáveis (`VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY`): o `.env` local não sobe junto.

**No `.github/workflows/ci.yml`**, troque `PROJETO: COLE-AQUI-O-REF-DO-PROJETO` pelo ref do
seu projeto, e cadastre o segredo `SUPABASE_ACCESS_TOKEN` em Settings → Secrets and
variables → Actions (crie o token em https://supabase.com/dashboard/account/tokens). É isso
que publica as Edge Functions.

### 5b. As Edge Functions — você não escreve nenhuma, só publica

As quatro já vêm prontas e testadas em `supabase/functions/`:

| Função | O que faz | Precisa de segredo? |
|---|---|---|
| `recompra` | o aviso das 9h — quem já devia ter repetido o pedido | não |
| `avisos` | entrega o push no celular | **sim**, VAPID |
| `gerenciar-usuario` | cria e edita gente em Mais → Equipe | não |
| `processdesk` | busca venda e estoque nas lojas da rede | **sim**, o feed |

**Publicar** é o CI que faz: todo push no `main` publica as quatro, depois de os testes
passarem (por isso o passo do `PROJETO` e do `SUPABASE_ACCESS_TOKEN` acima). Para publicar
na mão a primeira vez, com a CLI:

```bash
npx supabase functions deploy --project-ref SEU-REF
```

Sem nome de função = publica todas. Assim o repositório é a fonte da verdade e nenhuma fica
para trás por esquecimento.

**Os segredos** vão no dashboard → Edge Functions → Secrets (ou `npx supabase secrets set`).
Eles vivem **só no servidor** — nunca no `.env`, nunca no bundle do site:

| Segredo | De onde vem |
|---|---|
| `VAPID_PUBLIC_KEY` | `node scripts/gerar-vapid.mjs` |
| `VAPID_PRIVATE_KEY` | idem — **nunca commite nem cole em chat** |
| `VAPID_SUBJECT` | `mailto:morandi7@hotmail.com` |
| `PROCESSDESK_FEED_URL` | `https://hjvlmhyputuvfmahtbdj.supabase.co/functions/v1/industria-espelho` |
| `PROCESSDESK_FEED_KEY` | a chave que o Carlos entrega |

Sem os três VAPID, o app funciona normalmente — só o aviso no celular não sai, e a função
diz exatamente isso em vez de falhar calada. Trocar o par VAPID depois desinscreve todos os
aparelhos: só troque se a chave privada vazar.

### 6. Ligar o espelho da rede

Ver [LIGAR-NO-PROCESSDESK.md](LIGAR-NO-PROCESSDESK.md). Depende de uma chave que a Rede
Rondelli emite.

## Papéis

O que cada um acessa é decidido **no banco** (RLS), não na tela — esconder o botão não
protege contra quem chama a API com o próprio token.

| Papel | O que vê |
|---|---|
| **Admin** | tudo, mais **custo e margem** (só ele) |
| **Vendedor** | só os clientes/pedidos/consignado/comissão dele. Nunca vê custo nem margem |
| **Motorista** | só as **entregas pendentes** (tela Entregas + romaneio) |

## Deploy: o que é automático e o que não é

| O que | Como sobe | Quem faz |
|---|---|---|
| Front (telas, hooks, `src/lib/`) | push no `main` → Vercel builda | automático |
| Edge Functions (`supabase/functions/`) | push no `main` → GitHub Actions publica | automático |
| **Migration** (`supabase/migrations/`) | SQL Editor do dashboard | **você** |

O CI roda `test`, `typecheck` e `build` em todo push e PR, e só publica as Edge Functions
se os três passarem — os testes de contrato das funções moram nessa mesma suíte. Publica
**todas**, não só a que mudou: assim o repositório é a fonte da verdade e nenhuma fica para
trás por esquecimento.

**Migration continua na mão de propósito.** Deploy de função e migration são passos
diferentes, e a ordem entre eles exige alguém decidindo: publicar a função antes de a coluna
existir derruba a tela; aplicar um cron antes de a ação existir agenda chamada para o vazio.

## Custo e margem

O custo mora em **duas tabelas separadas** de `produtos`, e não numa coluna: a RLS do
Postgres protege *linha*, não *coluna* — custo dentro de `produtos` vazaria pela API para
vendedor e motorista, que precisam ler o catálogo.

| Tabela | O que guarda | Quem lê |
|---|---|---|
| `produto_custos` | custo atual por pacote (cadastra em Mais → Produtos) | só admin |
| `pedido_item_custos` | custo **congelado** no lançamento de cada item | só admin (leitura); ninguém escreve por API |

Quem grava o custo congelado é um **trigger** em `pedido_itens`, não um RPC: função com
`pedido_id` como argumento permitiria congelar o custo de hoje num pedido antigo e corromper
a margem histórica. Produto sem custo cadastrado não gera linha — a margem aparece como `—`,
nunca como zero.

## Fluxo de entrega

Pedido lançado nasce **`aberto`** (entrega pendente) e vira **`entregue`** quando alguém
confirma na tela **Entregas**, pelo RPC `marcar_entregue` — que só permite
`aberto → entregue`, nada mais. Métrica, painel e comissão excluem apenas `cancelado`.

**1 fardo = 5 kg** — é a medida que o motorista confere ao carregar, e aparece no romaneio
por item e no total.

## Preços

A tabela de preços foi semeada com **faixas de exemplo** (`supabase/seed.sql`). Os preços
reais você cadastra na tela **Preços** — cada salvamento cria uma versão nova, então o
histórico de pedido nunca muda de valor.

## Rotinas automáticas (pg_cron)

| Rotina | Quando | O que faz |
|---|---|---|
| `rotina-recompra` | 9h da Bahia | avisa no celular quem já passou da data de recomprar |
| `espelho-da-rede` | 6h30 da Bahia | busca venda e estoque dos seus produtos nas lojas |

As duas se identificam com um token que **nasce dentro do próprio banco**
(`rotina_config`), nunca com a `service_role`. Para rodar na hora:

```sql
select public.rodar_rotina_recompra();
select public.rodar_rotina_rede();
```

Para ver o que voltou: `select status_code, content from net._http_response order by created desc limit 5;`

Para desligar uma: `select cron.unschedule('rotina-recompra');`

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run test` | 455 testes (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | build de produção em `dist/` |

Rodar `npm run test && npm run typecheck` antes de commitar evita descobrir a quebra pelo
e-mail do GitHub.

## Onde mora a regra de negócio

Tudo que dá bug de dinheiro ou de data vive em `src/lib/`, testado e sem tocar em tela:
`preco.ts`, `prazo.ts`, `recompra.ts`, `consignado.ts`, `metricas-venda.ts`, `insights.ts`,
`margem.ts`, `entregas.ts`, `rede.ts`. As telas em `src/paginas/` só chamam esses módulos e
os hooks de `src/hooks/`.

## O que este app NÃO faz

Contas a receber, baixa de pagamento, inadimplência, aging, nota fiscal e estoque de
produção. Aqui a condição de pagamento existe só para calcular prazo médio e prever entrada
de caixa — quem cobra e quem emite documento fiscal é o ERP.
