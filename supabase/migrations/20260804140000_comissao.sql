-- Percentual de comissão por vendedor, versionado por data: mudar o percentual hoje
-- não pode reescrever comissão já apurada em mês anterior (histórico fica intacto).

create table comissao_regra (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references auth.users on delete cascade,
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 100),
  vigente_desde date not null,
  created_at timestamptz not null default now(),
  unique (vendedor_id, vigente_desde)
);

create index comissao_regra_vendedor_vigencia on comissao_regra (vendedor_id, vigente_desde desc);

alter table comissao_regra enable row level security;

create policy comissao_regra_admin_all on comissao_regra for all
  using (is_admin()) with check (is_admin());
create policy comissao_regra_select_propria on comissao_regra for select
  using (vendedor_id = auth.uid());
