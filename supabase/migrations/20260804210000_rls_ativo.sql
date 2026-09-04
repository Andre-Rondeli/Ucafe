-- "Ativo" na tela de Equipe era enfeite fora da Edge Function: a RLS nunca olhava
-- profiles.ativo. Desativar alguém não tirava acesso nenhum.
--
-- Provado no banco ANTES desta migration (role authenticated, ativo=false, tudo em
-- transação revertida):
--   vendedor inativo  -> 1 cliente, 7 pedidos, 6 faixas de preço, 1 pendência de
--                        consignado e 5 bases de comissão ainda visíveis
--   admin inativo     -> is_admin() = true, 2 clientes, 4 profiles, listar_equipe() = 4
--
-- Agora desativar tira o acesso de verdade: quem não está ativo não lê cliente, pedido,
-- consignado, preço, catálogo nem comissão, e não escreve nada. profiles_select continua
-- deixando cada um ler o PRÓPRIO perfil de propósito — é por ele que a tela descobre o
-- papel e consegue dizer "seu acesso foi desativado" em vez de mostrar telas vazias.

-- ---------------------------------------------------------------- funções de acesso

create or replace function esta_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and ativo);
$$;

-- admin desativado deixa de ser admin (antes bastava papel = 'admin')
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and papel = 'admin' and ativo
  );
$$;

-- usada pelas policies de pedidos, pedido_itens e consignado_movimentos
create or replace function pode_ver_cliente(p_cliente_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.esta_ativo() and exists (
      select 1 from public.clientes c
      where c.id = p_cliente_id and c.vendedor_id = auth.uid()
    )
  );
$$;

grant execute on function esta_ativo() to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function pode_ver_cliente(uuid) to authenticated;

-- ---------------------------------------------------------------- policies

-- clientes: estas olham vendedor_id direto, então precisam do ativo explícito
drop policy clientes_select on clientes;
create policy clientes_select on clientes for select
  using (is_admin() or (esta_ativo() and vendedor_id = auth.uid()));

drop policy clientes_insert on clientes;
create policy clientes_insert on clientes for insert
  with check (is_admin() or (esta_ativo() and vendedor_id = auth.uid()));

drop policy clientes_update on clientes;
create policy clientes_update on clientes for update
  using (is_admin() or (esta_ativo() and vendedor_id = auth.uid()))
  with check (is_admin() or (esta_ativo() and vendedor_id = auth.uid()));

-- preço e catálogo: a leitura exigia apenas "estar logado"; agora exige estar ativo
drop policy precos_select on precos_faixa;
create policy precos_select on precos_faixa for select
  using (esta_ativo());

drop policy produtos_select on produtos;
create policy produtos_select on produtos for select
  using (esta_ativo());

-- comissão do próprio vendedor
drop policy comissao_regra_select_propria on comissao_regra;
create policy comissao_regra_select_propria on comissao_regra for select
  using (esta_ativo() and vendedor_id = auth.uid());

-- ---------------------------------------------------------------- RPCs security definer
-- Estas decidem sozinhas quem pode ver (a RLS não as alcança), então o ativo entra no corpo.

create or replace function bases_comissao(p_vendedor_id uuid, p_inicio date, p_fim date)
returns table(data date, valor numeric, origem text, descricao text)
language sql stable security definer set search_path = public as $$
  select p.data, p.total_valor, 'pedido'::text, c.nome
  from pedidos p
  join clientes c on c.id = p.cliente_id
  where (is_admin() or (esta_ativo() and auth.uid() = p_vendedor_id))
    and c.vendedor_id = p_vendedor_id
    and p.data between p_inicio and p_fim
    and p.status <> 'cancelado'
    and p.condicao_pagamento <> 'consignado'

  union all

  select
    m.data,
    coalesce(preco.preco_unit_aplicado * m.qtd_pacotes, 0),
    'consignado'::text,
    case
      when preco.preco_unit_aplicado is null then c.nome || ' — sem preço de referência'
      else c.nome
    end
  from consignado_movimentos m
  join clientes c on c.id = m.cliente_id
  left join lateral (
    select pi.preco_unit_aplicado
    from consignado_movimentos entrega
    join pedidos pe on pe.id = entrega.pedido_id
    join pedido_itens pi on pi.pedido_id = pe.id and pi.sku = entrega.sku
    where entrega.cliente_id = m.cliente_id
      and entrega.sku = m.sku
      and entrega.tipo = 'entrega'
      and entrega.data <= m.data
    order by entrega.data desc
    limit 1
  ) preco on true
  where (is_admin() or (esta_ativo() and auth.uid() = p_vendedor_id))
    and c.vendedor_id = p_vendedor_id
    and m.data between p_inicio and p_fim
    and m.tipo = 'venda_apurada';
$$;

grant execute on function bases_comissao(uuid, date, date) to authenticated;

create or replace function pendencias_consignado()
returns table (
  cliente_id uuid,
  cliente_nome text,
  whatsapp text,
  vendedor_id uuid,
  prazo_retorno date,
  saldo_250g bigint,
  saldo_500g bigint,
  ultima_apuracao date,
  ultima_entrega date
)
language sql stable security definer set search_path = public as $$
  with saldo as (
    select
      cm.cliente_id,
      coalesce(sum(cm.qtd_pacotes) filter (where cm.sku = '250g' and cm.tipo = 'entrega'), 0)
        - coalesce(sum(cm.qtd_pacotes) filter (where cm.sku = '250g' and cm.tipo in ('venda_apurada', 'retorno')), 0)
        as saldo_250g,
      coalesce(sum(cm.qtd_pacotes) filter (where cm.sku = '500g' and cm.tipo = 'entrega'), 0)
        - coalesce(sum(cm.qtd_pacotes) filter (where cm.sku = '500g' and cm.tipo in ('venda_apurada', 'retorno')), 0)
        as saldo_500g,
      max(cm.data) filter (where cm.tipo = 'venda_apurada') as ultima_apuracao,
      max(cm.data) filter (where cm.tipo = 'entrega') as ultima_entrega
    from consignado_movimentos cm
    group by cm.cliente_id
  )
  select
    c.id as cliente_id,
    c.nome as cliente_nome,
    c.whatsapp,
    c.vendedor_id,
    (
      -- prazo mais urgente ainda pendente: o menor prazo_retorno entre os pedidos
      -- consignados (não cancelados) desse cliente
      select min(p.prazo_retorno)
      from pedidos p
      where p.cliente_id = c.id
        and p.condicao_pagamento = 'consignado'
        and p.status <> 'cancelado'
        and p.prazo_retorno is not null
    ) as prazo_retorno,
    s.saldo_250g,
    s.saldo_500g,
    s.ultima_apuracao,
    s.ultima_entrega
  from clientes c
  join saldo s on s.cliente_id = c.id
  where (s.saldo_250g <> 0 or s.saldo_500g <> 0)
    and (is_admin() or (esta_ativo() and c.vendedor_id = auth.uid()))
$$;

grant execute on function pendencias_consignado() to authenticated;

notify pgrst, 'reload schema';
