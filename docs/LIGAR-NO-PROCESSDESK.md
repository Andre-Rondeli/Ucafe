# Ligar o app no ProcessDesk — o espelho da rede

A tela **Nas lojas** é o motivo principal deste app existir: toda manhã ele passa a saber
quanto de Ucafé saiu em cada loja da Rede Rondelli e quanto ainda tem lá.

Ligar isso tem **dois lados**, e eles são de pessoas diferentes:

| Lado | Quem faz | O que faz |
|---|---|---|
| **Rede Rondelli** (ProcessDesk) | Carlos | cadastra a indústria Ucafé, mapeia os produtos e emite **uma chave** |
| **App Ucafé** | você | guarda a chave nos segredos do projeto e liga o cron |

A chave é a única coisa que atravessa. Nada mais.

---

## O estado hoje (medido em 04/09/2026, não é estimativa)

A porta já existe do lado do ProcessDesk — tabelas, RPCs e a Edge Function
`industria-espelho` estão no ar desde 30/08/2026. **Não é preciso escrever código novo lá.**

Os quatro produtos Ucafé já estão no catálogo da rede e já vendem:

| Código | Produto | Vende desde | Lojas |
|---|---|---|---|
| `29416` | CAFE PCT UCAFE ESPECIAL MOIDO 250G | 31/03/2026 | 10 |
| `29417` | CAFE PCT UCAFE ESPECIAL GRAO 250G | 31/03/2026 | 9 |
| `30435` | CAFE PCT UCAFE ESSENCIAL 250G GRAO | 04/08/2026 | 7 |
| `30447` | CAFE PCT UCAFE ESSENCIAL MOIDO 250G | 03/08/2026 | 5 |

Nenhum deles está atribuído a indústria nenhuma ainda — é isso que o passo 1 resolve.

---

## Lado da rede — três comandos (quem roda é o Carlos)

> ✅ **Já foi feito em 04/09/2026.** A indústria Ucafé existe
> (`671dbd1d-d05d-4d3d-93b0-f0d2ed531da4`), os 4 produtos estão mapeados e a chave
> `app da Ucafe` está ativa. Os comandos abaixo ficam registrados para quando entrar um
> SKU novo, para revogar a chave, ou para repetir com outra indústria.
>
> ⚠️ Eles **escrevem no banco da Rede Rondelli**. Só quem administra o ProcessDesk deve
> rodá-los, no SQL Editor do projeto `hjvlmhyputuvfmahtbdj`.

### 1. Cadastrar a indústria

```sql
insert into industry_entities (tenant_id, internal_name, presentation_name, created_by)
values (
  '9ef290b2-2b0e-48db-b923-4dc852b1d0fc',   -- tenant da Rede Rondelli
  'Ucafe', 'Ucafé', auth.uid()
)
returning id;   -- guarde este id para o passo 2
```

### 2. Mapear os produtos dela

Só o que estiver aqui é visível pelo feed. Produto fora desta lista não sai — nem por
engano, nem por `select *`.

```sql
insert into industry_product_assignments
  (tenant_id, industry_id, product_code, observed_brand, method, confidence, confirmed_by)
select
  '9ef290b2-2b0e-48db-b923-4dc852b1d0fc',
  '<ID-DO-PASSO-1>',
  code, 'UCAFE', 'confirmacao_humana', 'confirmada', auth.uid()
from unnest(array['29416','29417','30435','30447']) as code;
```

Quando a Ucafé lançar um SKU novo na rede, é aqui que ele entra — **até lá ele não aparece
no app dela**. Para tirar um produto, não apague a linha: preencha `valid_to` com a data.
Apagar reescreve o passado; `valid_to` diz "valeu até aqui".

### 3. Emitir a chave

A chave em claro **nunca é gravada** — o banco guarda só o `sha256` dela. Gere um segredo
aleatório, guarde-o num gerenciador de senhas e entregue **uma vez** ao seu primo, por um
canal privado (não por e-mail nem por grupo de WhatsApp).

```sql
-- gera a chave e grava só o hash. COPIE a chave que sai daqui: ela não aparece de novo.
with nova as (
  select encode(gen_random_bytes(32), 'hex') as chave
)
insert into industry_feed_keys (tenant_id, industry_id, key_hash, rotulo, created_by)
select
  '9ef290b2-2b0e-48db-b923-4dc852b1d0fc',
  '<ID-DO-PASSO-1>',
  encode(digest(chave, 'sha256'), 'hex'),
  'app da Ucafé',
  auth.uid()
from nova
returning (select chave from nova) as chave_em_claro;
```

Se `digest` reclamar, o `pgcrypto` está fora do `search_path`:
use `extensions.digest(chave, 'sha256')`.

**Para revogar depois**, sem apagar histórico:

```sql
update industry_feed_keys set ativo = false where rotulo = 'app da Ucafé';
```

### Conferir o que foi puxado, e quando

```sql
select * from industry_feed_access_log order by at desc limit 20;
```

Uma linha por chamada: qual indústria, quando, quantas linhas de venda e de estoque, e a
partir de que dia. Se um dia a pergunta for "quem puxou o quê", a resposta está aqui.

---

## Lado do app Ucafé — dois segredos e um cron

### 1. Segredos do projeto

No dashboard do **seu** Supabase → Edge Functions → Secrets:

| Segredo | Valor |
|---|---|
| `PROCESSDESK_FEED_URL` | `https://hjvlmhyputuvfmahtbdj.supabase.co/functions/v1/industria-espelho` |
| `PROCESSDESK_FEED_KEY` | a chave que o Carlos entregou |

A chave vive **só aqui**. Ela nunca entra no `.env`, no bundle do site nem no repositório —
quem fala com o ProcessDesk é a Edge Function `processdesk`, no servidor.

### 2. Configuração das rotinas

As rotinas precisam saber o endereço do seu próprio projeto (rode uma vez, no SQL Editor):

```sql
update rotina_config set
  url_base = 'https://SEU-PROJETO.supabase.co',
  anon_key = 'COLE-A-PUBLISHABLE-KEY-AQUI';
```

Sem isso, o cron levanta exceção com essa mensagem em vez de falhar calado.

### 3. Primeira sincronização, na mão

```sql
select public.rodar_rotina_rede();
```

E, alguns segundos depois:

```sql
select em, resultado, linhas_gravadas, detalhe
from rede_sync_execucoes order by em desc limit 5;
```

A primeira rodada traz o histórico inteiro (de `PRIMEIRO_DIA` em `src/lib/rede.ts` até
hoje) e pode levar um minuto. As seguintes trazem 3 dias e voltam em segundos.

Depois disso o cron `espelho-da-rede` roda sozinho **todo dia às 6h30 da Bahia** — depois
de o ProcessDesk terminar de receber a carga do Consinco, e antes de qualquer pessoa abrir
a tela.

---

## ⚠️ A primeira carga de estoque vem truncada em 1000 linhas

**Medido em 04/09/2026, com a chave já emitida.** O feed devolveu 241 linhas de venda
(completo) e **1000 linhas de estoque, quando existem 1513**. O corte não está na Edge —
é o `max-rows` do PostgREST, que no Supabase vale 1000 por padrão.

Como a consulta vem ordenada por data crescente, **o que se perde é o fim**: a primeira
carga gravaria estoque até 22/08 em vez de até hoje.

Isso só morde na **primeira** sincronização, que pede o histórico inteiro. As diárias
pedem 3 dias e ficam na casa da centena. Mas vale saber de duas coisas:

1. **Faça a carga inicial em fatias.** Antes da primeira rodada, ponha `PRIMEIRO_DIA` em
   `src/lib/rede.ts` numa data recente (ex.: `2026-08-01`), rode
   `select public.rodar_rotina_rede();`, confira, e só então volte a data para trás e rode
   de novo. Cada fatia cabe no teto e o upsert por PK absorve a sobreposição.
2. **Se um dia a Ucafé tiver muitos SKUs na rede**, o feed diário também pode passar de
   1000 — e aí truncaria todo dia, em silêncio. A correção definitiva é paginar dentro da
   Edge `industria-espelho` (`.range()` em laço), do lado do ProcessDesk. Está registrado
   como pendência.

Nada disso apaga dado: a trava de completude olha a **venda**, que veio inteira.

## Três coisas que evitam ler o número errado

1. **O estoque é a foto da ABERTURA do dia**, não "agora". A loja vende durante o dia e o
   app só sabe disso amanhã.
2. **Dia sem venda aparece vazio, não zero.** Zero seria uma afirmação; vazio é a resposta
   honesta para "não chegou dado desse dia".
3. **Se a origem responder sem nenhuma venda, o app não apaga o que já tinha.** Origem
   vazia não é o mesmo que "não vendeu nada" — pode ser falha no meio do caminho. A trava
   está em `src/lib/rede.ts` (`decidirSeGrava`) e tem teste que quebra se alguém afrouxar.

---

## O que esta ligação NÃO faz

- Não mostra nada de outra marca — nem a categoria café inteira.
- Não sobe margem, custo nem preço de compra da rede. Isso fica do lado de lá.
- Não escreve nada no ProcessDesk. A porta é de leitura.
- Não manda aviso no celular quando um produto rompe numa loja. O dado já está em casa;
  ligar o aviso é uma decisão seguinte, e pequena.
