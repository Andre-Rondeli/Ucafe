# Leia primeiro

Este é um app de **venda para indústria/distribuidor**, pronto e testado, entregue como
ponto de partida. Ele nasceu de um app que está em produção há meses — foi copiado, teve a
integração com o ERP antigo removida, e chega aqui limpo.

**O que ele faz de mais importante:** puxa sozinho, toda manhã, quanto dos seus produtos
saiu em cada loja da Rede Rondelli e quanto ainda tem lá. Sem planilha, sem pedir relatório.

---

## O que já vem funcionando

| Tela | O que resolve |
|---|---|
| **Hoje** | o que vendeu no período, o que precisa de atenção |
| **Pedido** | lança pedido com **preço automático por faixa de volume**, sempre em múltiplo de 5 kg |
| **Clientes** | carteira, com **semáforo de recompra** por cliente |
| **Ficha do cliente** | histórico, ritmo de compra, próxima compra prevista, preço combinado |
| **Na hora de recomprar** | quem já passou da data, do mais atrasado para o menos |
| **Consignado** | saldo, giro e previsão de reposição por cliente |
| **Entregas** | fila do que foi lançado e ainda não foi entregue + romaneio impresso |
| **Painel** | vendas, ranking, canal, mix, prazo médio, caixa previsto, **margem** (só admin) |
| **Comissão** | apuração por vendedor, com percentual versionado |
| **Preços** | tabela por faixa de volume, versionada por data |
| **Produtos** | catálogo com foto e custo |
| **Equipe** | admin, vendedor e motorista |
| **Nas lojas** | ⭐ **seus produtos nas lojas da rede** — venda, estoque e cobertura em dias |
| **Avisos** | notificação no celular (PWA), incluindo o aviso das 9h de recompra |

**Três papéis, e quem vê o quê é decidido no banco (RLS), não na tela:**

- **Admin** — tudo, mais custo e margem (só ele)
- **Vendedor** — só os clientes/pedidos/consignado/comissão dele. Nunca vê custo nem margem
- **Motorista** — só as entregas pendentes

Instala no celular como app (PWA): abrir no navegador → Adicionar à Tela de Início.

---

## Os 6 passos para colocar no ar

Cada passo está detalhado em [docs/COMO-RODAR.md](docs/COMO-RODAR.md). Aqui é o mapa.

1. **Crie um projeto no Supabase** (gratuito para começar) e guarde a URL e a chave anon.
2. **Aplique as 29 migrations** de `supabase/migrations/`, na ordem do nome do arquivo.
3. **Configure o `.env`** (copie de `.env.example`) e rode `npm install && npm run dev`.
4. **Crie o primeiro usuário admin** pelo dashboard do Supabase.
5. **Publique** — Vercel builda o site sozinha; o CI publica as 4 Edge Functions. Você não
   escreve nenhuma função: só cadastra os segredos delas.
6. **Ligue o espelho da rede** — pede uma chave à Rede Rondelli. Ver
   [docs/LIGAR-NO-PROCESSDESK.md](docs/LIGAR-NO-PROCESSDESK.md).

Do 1 ao 5, umas 2 horas. O passo 6 depende de alguém do outro lado gerar a chave.

---

## Troque a marca antes de mostrar para alguém

O app já vem com o nome **Ucafé**. Se precisar trocar, são quatro lugares:

1. `src/lib/marca.ts` — a constante `MARCA`. É de onde vêm todos os textos da tela.
2. `index.html` — `<title>`, description, `apple-mobile-web-app-title`
3. `public/manifest.webmanifest` — `name`, `short_name`, `description` (é o nome do ícone
   no celular)
4. `package.json` — o campo `name`

Os ícones (`public/icones/`) são um "T" branco sobre âmbar, gerados por
`node scripts/gerar-icones.mjs` — abra o script e troque a letra e a cor. A cor de ação do
app é `amber-800` (`#92400e`), e ela aparece também no `theme-color` do `index.html` e do
manifest.

---

## Como este código está organizado (e por quê)

**Toda regra que dá bug de dinheiro ou de data vive em `src/lib/`** — módulos puros, sem
tocar em tela, cobertos por 455 testes:

| Arquivo | Responsabilidade |
|---|---|
| `preco.ts` | faixa pelo kg total do pedido, versionada por data |
| `prazo.ts` | vencimentos da condição, prazo médio ponderado, caixa previsto |
| `recompra.ts` | cadência, próxima compra, sinais do cliente, oportunidade de faixa |
| `consignado.ts` | saldo por movimento, giro, previsão de reposição |
| `metricas-venda.ts` | kg, receita, preço realizado vs tabela, mix, ranking, base de clientes |
| `margem.ts` | custo e margem; item sem custo = margem indefinida, **nunca zero** |
| `entregas.ts` | fardo como medida de carga (1 fardo = 5 kg), agrupamento, atraso |
| `rede.ts` | as regras do espelho da rede: watermark, fusão e a trava de completude |

As telas em `src/paginas/` só chamam esses módulos e os hooks de `src/hooks/`.

**Regra crítica não fica só na tela — vai também para o banco.** A tela pode ser
contornada por quem chamar a API com o próprio token; o banco não. É por isso que existem
RPC, trigger e RLS onde poderia haver só um `if`.

---

## Cinco decisões que vale conhecer antes de mexer

1. **UI e nomes de tabela/coluna em PT-BR.** Não é descuido — é decisão. A equipe que
   opera é leiga e lê o banco quando precisa conferir número.
2. **`pedido_itens.preco_unit_aplicado` é preço congelado.** Reajustar a tabela de preços
   nunca reescreve faturamento passado.
3. **Pedido é sempre múltiplo de 5 kg**, e as faixas de preço começam em 5, de 5 em 5.
   Isso está no banco, não só na tela.
4. **O custo mora em tabela separada de `produtos`.** A RLS do Postgres protege *linha*,
   não *coluna*: custo dentro de `produtos` vazaria pela API para vendedor e motorista,
   que precisam ler o catálogo.
5. **Nenhuma policy `USING (true)`**, e a `service_role` só existe dentro de Edge Function.

---

## O que foi removido na cópia (e o que sobrou no lugar)

O app original conversava com um ERP agrícola. Saiu tudo: envio de pedido para o ERP,
espelho de vendas, nota fiscal, montagem de carga por rota, estoque, títulos a receber,
comissão criada no ERP e a tela de produção.

O que **não** saiu junto:

- **Entregas** continua de pé, agora sobre o pedido do app (`aberto` → `entregue`).
- **Aviso das 9h de recompra** virou uma Edge Function própria, `supabase/functions/recompra`.
- **Cadastro de cliente** ficou manual (a busca por CNPJ vivia dentro da ponte com o ERP).

Quando você plugar o seu ERP, o lugar de começar é uma Edge Function nova — não código de
tela. Veja `supabase/functions/processdesk/index.ts` como molde: ela é a única dona do
segredo, e a regra que decide vive em `src/lib/rede.ts`, testada.

---

## Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run test       # 455 testes (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # build de produção em dist/
```

Os três últimos são o que o CI roda. Rode `npm run test && npm run typecheck` antes de
commitar.

## Uma coisa que morde, e é bom saber agora

**Mergear não aplica migration.** Aplicar no banco é um passo de gente. Existe
`supabase/APLICADAS.md` para registrar o que realmente subiu, e um teste que quebra quando
aparece migration nova sem registro. Não é burocracia: no projeto de origem esse degrau
engoliu duas migrations inteiras, com a Edge Function que dependia delas publicada.
