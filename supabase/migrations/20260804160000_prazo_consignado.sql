-- Prazo de retorno da consignação: hoje o vendedor entrega e não fica combinado
-- quando o cliente devolve ou apura. Sem essa data não há como cobrar a conferência.

alter table clientes
  add column prazo_consignado_dias int default 30 check (prazo_consignado_dias > 0);

alter table pedidos
  add column prazo_retorno date;

-- Adicionar p_prazo_retorno no fim muda a assinatura da função (9 parâmetros vs 8).
-- Caminho escolhido: create or replace cria a versão nova (assinatura diferente não
-- "substitui" a antiga de fato) e o drop explícito no fim derruba a de 8 parâmetros —
-- o front passa sempre o parâmetro novo, então não faz sentido manter as duas.
create or replace function criar_pedido(
  p_cliente_id uuid,
  p_data date,
  p_condicao condicao_pagamento,
  p_status status_pedido,
  p_observacao text,
  p_total_kg numeric,
  p_total_valor numeric,
  p_itens jsonb,
  p_prazo_retorno date default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_pedido_id uuid;
  v_kg_itens numeric;
  v_valor_itens numeric;
  v_prazo_retorno date;
begin
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens';
  end if;

  if abs(p_total_kg - round(p_total_kg / 5) * 5) > 0.001 or p_total_kg <= 0 then
    raise exception 'Pedido de % kg não fecha caixa: o volume tem que ser múltiplo de 5 kg', p_total_kg;
  end if;

  select
    sum(
      (item ->> 'qtd_pacotes')::int
      * case item ->> 'sku' when '250g' then 0.25 when '500g' then 0.5 end
    ),
    sum((item ->> 'subtotal')::numeric)
  into v_kg_itens, v_valor_itens
  from jsonb_array_elements(p_itens) as item;

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

  insert into pedidos (
    cliente_id, data, condicao_pagamento, status, observacao, total_kg, total_valor, prazo_retorno
  ) values (
    p_cliente_id, p_data, p_condicao, p_status, p_observacao, p_total_kg, p_total_valor, v_prazo_retorno
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

grant execute on function criar_pedido(
  uuid, date, condicao_pagamento, status_pedido, text, numeric, numeric, jsonb, date
) to authenticated;

-- assinatura antiga (8 parâmetros) fica órfã depois do create or replace acima —
-- derruba explicitamente para não sobrar duas versões de criar_pedido no banco
drop function if exists criar_pedido(
  uuid, date, condicao_pagamento, status_pedido, text, numeric, numeric, jsonb
);
