# Prompt para começar

Abra o Claude Code (ou Cursor, ou o assistente que você usar) **dentro desta pasta** e cole
o bloco abaixo. Ele dá ao assistente o contexto inteiro do projeto de uma vez — o que já
existe, o que não pode ser quebrado, e por onde começar.

---

## Cole a partir daqui

Você está assumindo o app de vendas da **Ucafé** — uma torrefação que vende café para
supermercados, bares, hotéis e revendas, e também fornece para as 16 lojas da Rede
Rondelli.

O app é uma cópia de um sistema que roda em produção há meses. Ele chegou aqui **sem a
integração com o ERP antigo** (que era de outra empresa) e **com o espelho da rede
intacto** — a parte que puxa, toda manhã, quanto de Ucafé saiu em cada loja da Rede
Rondelli. Ainda não foi publicado: nada disto está no ar.

**Leia primeiro, nesta ordem:**

1. `LEIA-PRIMEIRO.md` — o que existe, o que foi removido, as decisões que não se mexem
2. `docs/COMO-RODAR.md` — os 6 passos para colocar no ar
3. `docs/LIGAR-NO-PROCESSDESK.md` — a ligação com a rede: o que depende de mim e o que
   depende do outro lado
4. `docs/ESPELHO-REDE-TECNICO.md` — a arquitetura da ponte e as três travas que a protegem

**Stack:** Vite + React 18 + TypeScript + Tailwind v4 + TanStack Query v5 + React Router v6
+ Supabase (Postgres + Auth + RLS + Storage + Edge Functions em Deno). Sem backend próprio.
455 testes Vitest. `npm run test` / `npm run typecheck` / `npm run build`.

**Arquitetura que precisa ser respeitada:** toda regra de negócio vive em módulos puros e
testados em `src/lib/` (preço por faixa, prazo/caixa, recompra, consignado, comissão,
métricas, margem, entregas, espelho da rede). As telas em `src/paginas/` só chamam esses
módulos e os hooks de `src/hooks/`. Regra crítica não fica só na tela — vai também para o
banco, que é a barreira que ninguém contorna chamando a API com o próprio token.

**Constraints invioláveis:**

- UI e nomes de tabela/coluna em **PT-BR**. É decisão, não descuido — não "corrigir" para
  inglês.
- Dinheiro sempre por `arredondar2`; datas ISO `YYYY-MM-DD`; `new Date()` só dentro de
  `hojeIso()`.
- Todo número digitado passa por `paraNumero`, **nunca** por `Number()` — no Brasil se
  digita preço com vírgula, e `Number("11,00")` é `NaN`.
- `pedido_itens.preco_unit_aplicado` é **preço congelado**: reajuste nunca reescreve
  faturamento passado.
- Pedido é sempre múltiplo de 5 kg; faixas de preço em números fechados de 5 em 5,
  começando em 5. Isso está no banco, não só na tela.
- RLS em toda tabela, **nenhuma policy `USING (true)`**. `service_role` só dentro de Edge
  Function; nunca no bundle, nunca em variável de build.
- Custo mora em tabela separada de `produtos` — a RLS protege linha, não coluna.
- **Sem dependência nova no front** (nada de biblioteca de ícone, gráfico, CSV ou PDF): SVG
  inline. O app roda no celular de vendedor, em rua com sinal ruim.
- **Mergear não aplica migration.** Aplicar no banco é passo de gente, registrado em
  `supabase/APLICADAS.md` — e há um teste que quebra quando aparece migration nova sem
  registro.

**Onde a rede de testes é fraca, e vale saber:** os testes cobrem bem lógica de negócio
pura. Os bugs que chegaram em produção no projeto de origem passaram todos por ela e foram
descobertos com o app na mão — vírgula decimal virando `NaN`, comparação de ponto flutuante
acusando furo onde não havia, versão de tabela de preço acumulando em vez de substituir, e
CORS de Edge Function que não liberava um header que o `supabase-js` sempre manda. O padrão:
a rede pega **cálculo** e não pega **navegador, integração e caminho de erro**.

### A TAREFA

Me leve do zero até o app no ar, na ordem de `docs/COMO-RODAR.md`. Trabalhe em fases, e ao
fim de cada uma me diga o que preciso fazer com a minha própria mão (criar projeto, colar
chave, apertar botão no dashboard) — essas partes você não consegue fazer por mim.

1. **Projeto Supabase e migrations.** Me guie para criar o projeto e aplicar as 29
   migrations na ordem. Depois **confira o objeto vivo**, não o registro: as tabelas
   existem? as policies existem? os dois crons estão agendados? Migration aplicada não é
   prova; objeto vivo é.
2. **Marca e identidade.** O nome já está como "Ucafé" em `src/lib/marca.ts`, `index.html`,
   `public/manifest.webmanifest` e `package.json`. Os ícones ainda são um "T" branco sobre
   âmbar (`scripts/gerar-icones.mjs`) — troque a letra e a cor para a identidade da Ucafé.
3. **Rodar local e passar os olhos em todas as telas** com um usuário admin de verdade.
   Onde uma tela ficar vazia ou estranha por causa do que foi removido junto com o ERP
   antigo, me mostre e proponha o que fazer — não conserte por conta própria.
4. **Publicar** na Vercel e ligar o CI (o `PROJETO` no `.github/workflows/ci.yml` e o
   segredo `SUPABASE_ACCESS_TOKEN`).
5. **Ligar o espelho da rede** quando a chave chegar, e provar que funcionou: rodar
   `select public.rodar_rotina_rede();` e ler `rede_sync_execucoes` — não basta "não deu
   erro", quero ver linha gravada e a tela **Nas lojas** com número.
6. **Cadastrar os produtos e a tabela de preços reais** da Ucafé (hoje há faixas de exemplo
   em `supabase/seed.sql`), criar a equipe e desligar o cadastro público no Supabase.

Ao fim de cada fase, rode `npm run test && npm run typecheck` e me diga o resultado. Se algo
falhar, mostre a saída — não resuma como "corrigido".

**Uma coisa que eu quero saber cedo:** liste o que ficou de fora quando a integração com o
ERP antigo foi removida e que eu talvez queira de volta quando plugar o meu próprio ERP —
com o custo de cada um. Não implemente nada disso agora.
