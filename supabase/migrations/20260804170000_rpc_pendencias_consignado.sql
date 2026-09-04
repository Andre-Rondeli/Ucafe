-- Lista os clientes com saldo consignado pendente — a régua que faltava para o
-- vendedor saber o que precisa conferir, sem vasculhar ficha por ficha.
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
    and (is_admin() or c.vendedor_id = auth.uid())
$$;

grant execute on function pendencias_consignado() to authenticated;
