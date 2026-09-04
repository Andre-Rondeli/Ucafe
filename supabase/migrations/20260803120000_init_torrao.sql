-- Torrão — schema inicial de vendas.
-- Não existe contas a receber aqui: quem cobra é o ERP que emite a NF.
-- A condição de pagamento é guardada só como insumo de cálculo (prazo médio, caixa previsto).

create type sku as enum ('250g', '500g');
create type canal_cliente as enum ('loja_rondelli', 'revenda', 'bar_padaria', 'hotel', 'consumidor');
create type condicao_pagamento as enum (
  'avista', 'prazo_7', 'prazo_14', 'prazo_28', 'prazo_30', 'prazo_30_60', 'consignado'
);
create type status_pedido as enum ('aberto', 'entregue', 'cancelado');
create type tipo_mov_consignado as enum ('entrega', 'venda_apurada', 'retorno');
create type papel_usuario as enum ('admin', 'vendedor');

-- ---------------------------------------------------------------- perfis

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  papel papel_usuario not null default 'vendedor',
  created_at timestamptz not null default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- security definer para não recursar na RLS de profiles
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and papel = 'admin');
$$;

-- ---------------------------------------------------------------- clientes

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  canal canal_cliente not null,
  cidade text,
  whatsapp text,
  condicao_padrao condicao_pagamento not null default 'avista',
  cadencia_declarada_dias int check (cadencia_declarada_dias > 0),
  vendedor_id uuid not null default auth.uid() references auth.users on delete restrict,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index clientes_vendedor_idx on clientes (vendedor_id);
create index clientes_nome_idx on clientes (nome);

create function pode_ver_cliente(p_cliente_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.clientes c
    where c.id = p_cliente_id and c.vendedor_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------- tabela de preço

create table precos_faixa (
  id uuid primary key default gen_random_uuid(),
  sku sku not null,
  kg_min numeric(10, 3) not null check (kg_min >= 0),
  kg_max numeric(10, 3) check (kg_max > kg_min),
  preco_unit numeric(10, 2) not null check (preco_unit > 0),
  vigente_desde date not null,
  created_at timestamptz not null default now(),
  unique (sku, kg_min, vigente_desde)
);

create index precos_faixa_busca_idx on precos_faixa (sku, vigente_desde desc);

-- ---------------------------------------------------------------- pedidos

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes on delete restrict,
  data date not null default current_date,
  condicao_pagamento condicao_pagamento not null,
  status status_pedido not null default 'aberto',
  total_kg numeric(10, 3) not null check (total_kg > 0),
  total_valor numeric(12, 2) not null check (total_valor >= 0),
  observacao text,
  created_by uuid not null default auth.uid() references auth.users on delete restrict,
  created_at timestamptz not null default now()
);

create index pedidos_cliente_data_idx on pedidos (cliente_id, data desc);
create index pedidos_data_idx on pedidos (data desc);

create table pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos on delete cascade,
  sku sku not null,
  qtd_pacotes int not null check (qtd_pacotes > 0),
  -- congelado no insert: reajuste de tabela nunca reescreve faturamento passado
  preco_unit_aplicado numeric(10, 2) not null check (preco_unit_aplicado > 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  unique (pedido_id, sku)
);

create index pedido_itens_pedido_idx on pedido_itens (pedido_id);

-- ---------------------------------------------------------------- consignado

create table consignado_movimentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes on delete restrict,
  pedido_id uuid references pedidos on delete set null,
  sku sku not null,
  tipo tipo_mov_consignado not null,
  qtd_pacotes int not null check (qtd_pacotes > 0),
  data date not null default current_date,
  created_by uuid not null default auth.uid() references auth.users on delete restrict,
  created_at timestamptz not null default now()
);

create index consignado_cliente_idx on consignado_movimentos (cliente_id, data);

-- ---------------------------------------------------------------- RLS
-- Nenhuma policy USING (true). Leitura de preço exige usuário logado.

alter table profiles enable row level security;
alter table clientes enable row level security;
alter table precos_faixa enable row level security;
alter table pedidos enable row level security;
alter table pedido_itens enable row level security;
alter table consignado_movimentos enable row level security;

create policy profiles_select on profiles for select
  using (id = auth.uid() or is_admin());
-- sem policy de update para o próprio usuário: uma subquery em profiles dentro de
-- uma policy de profiles recursa. Mudança de papel é do admin, e nada mais no
-- perfil precisa ser editável na v1.
create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

create policy clientes_select on clientes for select
  using (is_admin() or vendedor_id = auth.uid());
create policy clientes_insert on clientes for insert
  with check (is_admin() or vendedor_id = auth.uid());
create policy clientes_update on clientes for update
  using (is_admin() or vendedor_id = auth.uid())
  with check (is_admin() or vendedor_id = auth.uid());
create policy clientes_delete on clientes for delete
  using (is_admin());

create policy precos_select on precos_faixa for select
  using (auth.uid() is not null);
create policy precos_admin_write on precos_faixa for all
  using (is_admin()) with check (is_admin());

create policy pedidos_select on pedidos for select
  using (pode_ver_cliente(cliente_id));
create policy pedidos_insert on pedidos for insert
  with check (pode_ver_cliente(cliente_id));
create policy pedidos_update on pedidos for update
  using (pode_ver_cliente(cliente_id)) with check (pode_ver_cliente(cliente_id));
create policy pedidos_delete on pedidos for delete
  using (is_admin());

create policy pedido_itens_select on pedido_itens for select
  using (exists (select 1 from pedidos p where p.id = pedido_id and pode_ver_cliente(p.cliente_id)));
create policy pedido_itens_insert on pedido_itens for insert
  with check (exists (select 1 from pedidos p where p.id = pedido_id and pode_ver_cliente(p.cliente_id)));
create policy pedido_itens_delete on pedido_itens for delete
  using (exists (select 1 from pedidos p where p.id = pedido_id and pode_ver_cliente(p.cliente_id)));

create policy consignado_select on consignado_movimentos for select
  using (pode_ver_cliente(cliente_id));
create policy consignado_insert on consignado_movimentos for insert
  with check (pode_ver_cliente(cliente_id));
create policy consignado_delete on consignado_movimentos for delete
  using (is_admin());

grant execute on function is_admin() to authenticated;
grant execute on function pode_ver_cliente(uuid) to authenticated;
