-- Cria pedido + itens (+ movimentos de consignado) em UMA transação.
-- SECURITY INVOKER de propósito: a RLS do vendedor continua valendo aqui dentro.
create function criar_pedido(
  p_cliente_id uuid,
  p_data date,
  p_condicao condicao_pagamento,
  p_status status_pedido,
  p_observacao text,
  p_total_kg numeric,
  p_total_valor numeric,
  p_itens jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_pedido_id uuid;
begin
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens';
  end if;

  insert into pedidos (
    cliente_id, data, condicao_pagamento, status, observacao, total_kg, total_valor
  ) values (
    p_cliente_id, p_data, p_condicao, p_status, p_observacao, p_total_kg, p_total_valor
  )
  returning id into v_pedido_id;

  insert into pedido_itens (pedido_id, sku, qtd_pacotes, preco_unit_aplicado, subtotal)
  select
    v_pedido_id,
    (item ->> 'sku')::sku,
    (item ->> 'qtd_pacotes')::int,
    (item ->> 'preco_unit_aplicado')::numeric,
    (item ->> 'subtotal')::numeric
  from jsonb_array_elements(p_itens) as item;

  -- consignado: a entrega física é registrada junto, senão o saldo nasce errado
  if p_condicao = 'consignado' then
    insert into consignado_movimentos (cliente_id, pedido_id, sku, tipo, qtd_pacotes, data)
    select
      p_cliente_id,
      v_pedido_id,
      (item ->> 'sku')::sku,
      'entrega'::tipo_mov_consignado,
      (item ->> 'qtd_pacotes')::int,
      p_data
    from jsonb_array_elements(p_itens) as item;
  end if;

  return v_pedido_id;
end;
$$;

grant execute on function criar_pedido(uuid, date, condicao_pagamento, status_pedido, text, numeric, numeric, jsonb) to authenticated;
