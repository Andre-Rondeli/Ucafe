-- Catálogo de produtos: hoje só existem 250g/500g fixos no código (enum sku).
-- A torrefação vai vender outros formatos — esta migration cria a tabela produtos
-- e migra as três tabelas que hoje gravam `sku` para gravar `produto_id`, SEM apagar
-- `sku` (histórico de pedido/preço/consignado continua lendo por sku onde precisar).
--
-- produto_id fica NOT NULL em precos_faixa e pedido_itens (toda linha, velha ou nova,
-- sempre referencia um produto). Em consignado_movimentos fica nullable de propósito:
-- a tela de apuração de consignado (Ficha do Cliente) ainda só lança pelos 2 produtos
-- legado, então nem toda gravação futura carrega produto_id garantido.

create table produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  peso_kg numeric(10,3) not null check (peso_kg > 0),
  foto_url text,
  sku_legado sku,              -- preenchido só nos dois produtos que já existiam
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
create unique index produtos_sku_legado_idx on produtos (sku_legado) where sku_legado is not null;
create index produtos_ativo_idx on produtos (ativo, ordem);

alter table produtos enable row level security;

create policy produtos_select on produtos for select
  using (auth.uid() is not null);
create policy produtos_admin_write on produtos for all
  using (is_admin()) with check (is_admin());

insert into produtos (nome, peso_kg, sku_legado, ordem) values
  ('Café Torrão 250g', 0.25, '250g', 1),
  ('Café Torrão 500g', 0.5, '500g', 2);

-- ---------------------------------------------------------------- precos_faixa

alter table precos_faixa add column produto_id uuid references produtos;

update precos_faixa pf
set produto_id = p.id
from produtos p
where p.sku_legado = pf.sku;

alter table precos_faixa alter column produto_id set not null;

alter table precos_faixa drop constraint precos_faixa_sku_kg_min_vigente_desde_key;
drop index precos_faixa_busca_idx;
alter table precos_faixa add constraint precos_faixa_produto_kg_min_vigente_desde_key
  unique (produto_id, kg_min, vigente_desde);
create index precos_faixa_busca_idx on precos_faixa (produto_id, vigente_desde desc);

alter table precos_faixa alter column sku drop not null;

-- ---------------------------------------------------------------- pedido_itens

alter table pedido_itens add column produto_id uuid references produtos;

update pedido_itens pi
set produto_id = p.id
from produtos p
where p.sku_legado = pi.sku;

alter table pedido_itens alter column produto_id set not null;

alter table pedido_itens drop constraint pedido_itens_pedido_id_sku_key;
alter table pedido_itens add constraint pedido_itens_pedido_id_produto_id_key
  unique (pedido_id, produto_id);

alter table pedido_itens alter column sku drop not null;

-- ---------------------------------------------------------------- consignado_movimentos

alter table consignado_movimentos add column produto_id uuid references produtos;

update consignado_movimentos cm
set produto_id = p.id
from produtos p
where p.sku_legado = cm.sku;

alter table consignado_movimentos alter column sku drop not null;
