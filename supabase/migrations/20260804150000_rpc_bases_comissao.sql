-- Extrato de bases comissionáveis de um vendedor no período: pedidos (não-consignado, não
-- cancelado) + venda apurada de consignado (a entrega não comissiona, só a apuração).
-- Vazio se quem chama não for admin nem o próprio vendedor -- vendedor não vê colega.
create function bases_comissao(p_vendedor_id uuid, p_inicio date, p_fim date)
returns table(data date, valor numeric, origem text, descricao text)
language sql stable security definer set search_path = public as $$
  select p.data, p.total_valor, 'pedido'::text, c.nome
  from pedidos p
  join clientes c on c.id = p.cliente_id
  where (is_admin() or auth.uid() = p_vendedor_id)
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
  where (is_admin() or auth.uid() = p_vendedor_id)
    and c.vendedor_id = p_vendedor_id
    and m.data between p_inicio and p_fim
    and m.tipo = 'venda_apurada';
$$;

grant execute on function bases_comissao(uuid, date, date) to authenticated;
