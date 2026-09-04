-- Custo do produto e margem são informação do dono, não da equipe. RLS do Postgres
-- protege LINHA, não coluna: custo como coluna de `produtos` vazaria pela API para
-- todo mundo que lê o catálogo (vendedor monta pedido, motorista monta romaneio).
-- Por isso tabela separada, com policy só de admin.
create table produto_custos (
  produto_id uuid primary key references produtos on delete cascade,
  custo_unit numeric(10,2) not null check (custo_unit >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users
);

alter table produto_custos enable row level security;

create policy produto_custos_admin_all on produto_custos for all
  using (is_admin()) with check (is_admin());

-- Custo congelado por item, mesma razão do preço congelado: reajustar custo não pode
-- reescrever a margem de faturamento passado.
create table pedido_item_custos (
  pedido_item_id uuid primary key references pedido_itens on delete cascade,
  custo_unit_aplicado numeric(10,2) not null check (custo_unit_aplicado >= 0)
);

alter table pedido_item_custos enable row level security;

-- Só leitura, só admin. NENHUMA policy de escrita de propósito: quem grava é o
-- trigger abaixo (security definer). Assim ninguém reescreve custo de pedido antigo
-- por API direta -- nem admin, nem vendedor.
create policy pedido_item_custos_admin_select on pedido_item_custos for select
  using (is_admin());

-- Trigger em vez de RPC: uma função chamável pelo cliente com um pedido_id qualquer
-- permitiria congelar o custo de HOJE num pedido de meses atrás, corrompendo margem
-- histórica. Trigger não aceita argumento e roda em todo insert, venha de onde vier.
-- Produto sem custo cadastrado não gera linha -- a margem aparece como indefinida na
-- tela, nunca como zero.
create or replace function pedido_item_congelar_custo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into pedido_item_custos (pedido_item_id, custo_unit_aplicado)
  select new.id, pc.custo_unit
  from produto_custos pc
  where pc.produto_id = new.produto_id;
  return new;
end;
$$;

-- owner explícito: security definer roda com os privilégios do DONO, e é isso que
-- deixa o trigger escrever numa tabela sem policy de escrita e ler produto_custos
-- (que é admin-only). Owner implícito já causou incidente em outro projeto.
alter function public.pedido_item_congelar_custo() owner to postgres;

create trigger pedido_itens_congelar_custo
  after insert on pedido_itens
  for each row execute function pedido_item_congelar_custo();

notify pgrst, 'reload schema';
