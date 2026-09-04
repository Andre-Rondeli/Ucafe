-- Preço fixo por cliente e produto — "para Rondelli é sempre o mesmo preço".
--
-- **Precedência: o preço do cliente VENCE a faixa de kg.** Existindo preço aqui, o volume
-- do pedido deixa de mudar o valor do pacote. É exatamente isso que "preço fixo" quer
-- dizer, e é por isso que a faixa deixa de ser obrigatória para esse cliente.
--
-- `vigente_desde` pelo mesmo motivo da tabela de faixas: reajuste é REGISTRO NOVO, não
-- edição do antigo. Editar faria o histórico mudar sozinho, e pedido já lançado tem o
-- preço congelado em `pedido_itens.preco_unit_aplicado` — este cadastro só afeta pedido
-- novo.
--
-- Duas consequências que o Carlos precisa saber (estão no docs/PROXIMO-preco-por-cliente):
--   1. Comissão sai do valor do pedido, então preço menor = comissão menor.
--   2. Venda para a rede é transferência entre grupo, não venda de mercado. A margem das
--      duas continua somada no painel por enquanto.

create table if not exists precos_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes on delete cascade,
  produto_id uuid not null references produtos on delete cascade,
  preco_unit numeric(10,2) not null check (preco_unit >= 0),
  vigente_desde date not null default current_date,
  created_at timestamptz not null default now(),
  criado_por uuid references profiles on delete set null,
  -- dois preços do mesmo produto para o mesmo cliente no mesmo dia seria ambiguidade
  unique (cliente_id, produto_id, vigente_desde)
);

create index if not exists precos_cliente_busca_idx on precos_cliente (cliente_id, produto_id, vigente_desde desc);

alter table precos_cliente enable row level security;

-- lê quem enxerga o cliente (o vendedor precisa, para o pedido sair pelo preço certo);
-- escreve só admin, porque preço é decisão de dono
drop policy if exists precos_cliente_select on precos_cliente;
create policy precos_cliente_select on precos_cliente for select
  using (pode_ver_cliente(cliente_id));

drop policy if exists precos_cliente_admin on precos_cliente;
create policy precos_cliente_admin on precos_cliente for all
  using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';
