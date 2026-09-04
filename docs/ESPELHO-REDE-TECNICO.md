# Espelho da rede — documento técnico

Como o app sabe, toda manhã, quanto dos seus produtos saiu em cada loja da Rede Rondelli.
O par funcional deste arquivo é [ESPELHO-REDE-COMO-FUNCIONA.md](ESPELHO-REDE-COMO-FUNCIONA.md),
escrito para quem opera. O passo a passo para **ligar** está em
[LIGAR-NO-PROCESSDESK.md](LIGAR-NO-PROCESSDESK.md).

## O desenho

```
pg_cron (09:30 UTC = 06:30 BA)
   └─> rodar_rotina_rede()          SECURITY DEFINER, lê url/token/anon de rotina_config
        └─> net.http_post ─────────────────────> Edge `processdesk` (este projeto)
                                                      │ header x-industria-key (segredo)
                                                      ▼
                                            Edge `industria-espelho` (ProcessDesk)
                                                      │ acha a indústria pelo hash da chave
                                                      ▼
                                            RPC industria_feed_vendas()  ─┐ SECURITY DEFINER
                                            RPC industria_feed_estoque() ─┘ escopo travado
                                                      │
                                            JSON  ◄───┘
                                                      │
                                            upsert em rede_dia
```

**Por que duas Edges e não uma.** A do ProcessDesk é a porta: valida a chave, decide o
escopo e audita. A daqui é o consumidor: sabe onde gravar e como casar loja/produto. Fundir
as duas obrigaria uma das pontas a guardar credencial da outra.

**Quem puxa é o dono do espelho.** O ProcessDesk não conhece este app — ele só responde a
quem tem chave. E a `service_role` do ProcessDesk nunca sai de lá: é a chave-mestra das 16
lojas, não entra num app de três usuários.

## O que o feed devolve, e o que ele não pode devolver

| Feed | Colunas |
|---|---|
| vendas | `sale_date`, `store_code`, `product_code`, `product_name`, `qtd`, `valor` |
| estoque | `snapshot_date`, `store_code`, `product_code`, `estoque_qtd` |

**Nenhuma coluna de margem ou custo existe na assinatura das RPCs.** O contrato é o tipo,
não a boa intenção: coluna que não existe no `RETURNS TABLE` não vaza por descuido de um
`select *`.

Os produtos vêm de `industry_product_assignments` **vigentes** (`valid_to is null`), nunca
de lista fixa no código. Cadastrar SKU novo do lado da rede é o que o faz aparecer aqui.

`qtd` e `valor` já chegam **líquidos de devolução**.

## `rede_dia` — a tabela espelho

```sql
rede_dia(
  dia date, loja_codigo text, produto_codigo text,   -- PK composta
  produto_nome text,
  venda_qtd numeric, venda_valor numeric,            -- nulos quando não houve venda no dia
  estoque_qtd numeric,                               -- foto de ABERTURA do dia
  atualizado_em timestamptz default now()
)
```

**Uma tabela só, e não duas** (venda e estoque separadas): o grão é o mesmo
`(dia, loja, produto)`, e uma tabela significa um upsert e uma tela. PK natural, então
reprocessar não duplica — e o Consinco reenvia os últimos dias se autocorrigindo, então
reprocessar é o normal, não a exceção.

**Coluna nula é a resposta honesta** para "não houve venda nesse dia". Zero seria uma
afirmação.

RLS: `select` para todo usuário ativo; `insert/update` só `service_role`. É espelho —
ninguém digita aqui.

## As três travas que importam

Todas vivem em `src/lib/rede.ts`, cobertas por teste. Se alguém afrouxar qualquer uma, o
teste cai.

**1. Watermark com sobreposição de 3 dias.** Pede `desde = maior dia já gravado − 3`. O
Consinco reenvia carga parcial e se autocorrige nos dias seguintes; o upsert por PK absorve
a correção. Primeira rodada sem watermark → `PRIMEIRO_DIA`.

**2. Trava de completude** (`decidirSeGrava`). Se a resposta vier com **zero linha de
venda** e o espelho já tiver dado, **não grava nada** e devolve erro. Origem vazia ≠ origem
encolhida, e um sweep silencioso apaga histórico com cron verde.

**3. Fusão antes de gravar** (`fundirFeed`). Venda e estoque viram uma linha só por
`(dia, loja, produto)` antes do upsert. Dois upserts em sequência seria o caminho que apaga
estoque com `null`.

## Horário

`30 9 * * *` UTC = **06:30 da Bahia** — depois da janela de sincronização do ProcessDesk
com o Consinco (02:00–06:00 BA) e antes do expediente. A Bahia não tem horário de verão
desde 2019: deslocamento fixo −3. Se a sua operação for de outro fuso, ajuste na migration
`20260830191000_cron_espelho_da_rede.sql`.

## Onde olhar quando não vier dado

```sql
-- como foi cada rodada, em português
select em, resultado, linhas_gravadas, detalhe
from rede_sync_execucoes order by em desc limit 10;

-- o que o servidor respondeu de fato
select status_code, content from net._http_response order by created desc limit 5;

-- rodar agora, sem esperar as 6h30
select public.rodar_rotina_rede();
```

Toda rodada é registrada em `rede_sync_execucoes`, **inclusive as que falham** — quatro
caminhos de erro diferentes gravam ali. Cron verde com espelho parado é o tipo de falha que
só aparece semanas depois; esse log é o que a torna visível no mesmo dia.

## O que este desenho deliberadamente NÃO faz

- Não abre outras marcas nem a categoria inteira.
- Não sobe margem, custo ou preço de compra da rede.
- Não escreve nada no ProcessDesk — a porta é de leitura.
- Não liga alerta nem push quando um produto rompe numa loja. O dado já está em casa;
  isso é decisão seguinte, e pequena.
