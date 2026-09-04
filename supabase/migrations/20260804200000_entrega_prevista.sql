-- Data de entrega prevista no pedido: o romaneio (papel que acompanha a mercadoria)
-- precisa de uma data-alvo pra separação/entrega, que pode ser diferente da data do
-- pedido (lançado hoje, entrega marcada pra depois). Sem data informada, entrega no
-- mesmo dia do pedido é o caso comum -- por isso o default cai em p_data.

alter table pedidos
  add column data_entrega_prevista date;

-- Adicionar p_data_entrega_prevista no fim muda a assinatura (10 parâmetros vs 9) --
-- mesmo caminho das migrations anteriores: create or replace cria a versão nova e o
-- drop explícito no fim derruba a de 9 parâmetros.
create or replace function criar_pedido(
  p_cliente_id uuid,
  p_data date,
  p_condicao condicao_pagamento,
  p_status status_pedido,
  p_observacao text,
  p_total_kg numeric,
  p_total_valor numeric,
  p_itens jsonb,
  p_prazo_retorno date default null,
  p_data_entrega_prevista date default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_pedido_id uuid;
  v_qtd_itens int;
  v_kg_itens numeric;
  v_valor_itens numeric;
  v_prazo_retorno date;
  v_data_entrega_prevista date;
begin
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens';
  end if;

  if abs(p_total_kg - round(p_total_kg / 5) * 5) > 0.001 or p_total_kg <= 0 then
    raise exception 'Pedido de % kg não fecha caixa: o volume tem que ser múltiplo de 5 kg', p_total_kg;
  end if;

  select
    count(*),
    sum((item ->> 'qtd_pacotes')::int * pr.peso_kg),
    sum((item ->> 'subtotal')::numeric)
  into v_qtd_itens, v_kg_itens, v_valor_itens
  from jsonb_array_elements(p_itens) as item
  join produtos pr on pr.id = coalesce(
    nullif(item ->> 'produto_id', '')::uuid,
    (select id from produtos where sku_legado = (item ->> 'sku')::sku)
  );

  if v_qtd_itens is distinct from jsonb_array_length(p_itens) then
    raise exception 'Item de pedido referencia produto inexistente';
  end if;

  -- tolerância de 1 g e 1 centavo: só absorve arredondamento, não erro de conta
  if abs(v_kg_itens - p_total_kg) > 0.001 then
    raise exception 'Total de kg (%) não corresponde aos itens (%)', p_total_kg, v_kg_itens;
  end if;

  if abs(v_valor_itens - p_total_valor) > 0.01 then
    raise exception 'Total em R$ (%) não corresponde aos itens (%)', p_total_valor, v_valor_itens;
  end if;

  -- prazo de retorno só existe em consignado; se não vier calculado do front, cai no
  -- prazo padrão do cliente (ou 30 dias, se o cliente não tiver um definido)
  if p_condicao = 'consignado' then
    v_prazo_retorno := coalesce(
      p_prazo_retorno,
      p_data + coalesce((select prazo_consignado_dias from clientes where id = p_cliente_id), 30)
    );
  else
    v_prazo_retorno := null;
  end if;

  -- entrega no mesmo dia do pedido é o caso comum: sem data informada, cai em p_data
  v_data_entrega_prevista := coalesce(p_data_entrega_prevista, p_data);

  insert into pedidos (
    cliente_id, data, condicao_pagamento, status, observacao, total_kg, total_valor,
    prazo_retorno, data_entrega_prevista
  ) values (
    p_cliente_id, p_data, p_condicao, p_status, p_observacao, p_total_kg, p_total_valor,
    v_prazo_retorno, v_data_entrega_prevista
  )
  returning id into v_pedido_id;

  insert into pedido_itens (pedido_id, produto_id, sku, qtd_pacotes, preco_unit_aplicado, subtotal)
  select
    v_pedido_id,
    pr.id,
    pr.sku_legado,
    (item ->> 'qtd_pacotes')::int,
    (item ->> 'preco_unit_aplicado')::numeric,
    (item ->> 'subtotal')::numeric
  from jsonb_array_elements(p_itens) as item
  join produtos pr on pr.id = coalesce(
    nullif(item ->> 'produto_id', '')::uuid,
    (select id from produtos where sku_legado = (item ->> 'sku')::sku)
  );

  -- consignado: a entrega física é registrada junto, senão o saldo nasce errado
  if p_condicao = 'consignado' then
    insert into consignado_movimentos (cliente_id, pedido_id, produto_id, sku, tipo, qtd_pacotes, data)
    select
      p_cliente_id,
      v_pedido_id,
      pr.id,
      pr.sku_legado,
      'entrega'::tipo_mov_consignado,
      (item ->> 'qtd_pacotes')::int,
      p_data
    from jsonb_array_elements(p_itens) as item
    join produtos pr on pr.id = coalesce(
      nullif(item ->> 'produto_id', '')::uuid,
      (select id from produtos where sku_legado = (item ->> 'sku')::sku)
    );
  end if;

  return v_pedido_id;
end;
$$;

grant execute on function criar_pedido(
  uuid, date, condicao_pagamento, status_pedido, text, numeric, numeric, jsonb, date, date
) to authenticated;

-- assinatura antiga (9 parâmetros) fica órfã depois do create or replace acima --
-- derruba explicitamente para não sobrar duas versões de criar_pedido no banco
drop function if exists criar_pedido(
  uuid, date, condicao_pagamento, status_pedido, text, numeric, numeric, jsonb, date
);
