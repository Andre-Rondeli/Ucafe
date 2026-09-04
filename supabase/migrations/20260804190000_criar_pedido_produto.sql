-- criar_pedido e salvar_versao_precos passam a trabalhar por produto_id em vez do
-- case fixo 250g/500g. Compatibilidade de deploy: o app já em produção continua
-- mandando só `sku` até o front do GRUPO 3 ir ao ar (o push é só no fim dos 3
-- grupos) — por isso cada item aceita produto_id OU sku, resolvendo pelo
-- sku_legado do catálogo quando produto_id não vier. `sku` gravado no pedido/faixa
-- nunca vem do que o cliente mandou: vem sempre do sku_legado do produto resolvido,
-- pra nunca gravar sku e produto incoerentes.

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
  v_qtd_itens int;
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

  insert into pedidos (
    cliente_id, data, condicao_pagamento, status, observacao, total_kg, total_valor, prazo_retorno
  ) values (
    p_cliente_id, p_data, p_condicao, p_status, p_observacao, p_total_kg, p_total_valor, v_prazo_retorno
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
  uuid, date, condicao_pagamento, status_pedido, text, numeric, numeric, jsonb, date
) to authenticated;

-- salvar_versao_precos: mesma troca de sku fixo por produto_id, mesma compatibilidade
-- de transição (aceita produto_id OU sku por faixa).
create or replace function salvar_versao_precos(p_vigente_desde date, p_faixas jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_qtd integer;
begin
  if jsonb_array_length(p_faixas) = 0 then
    raise exception 'Nenhuma faixa informada para salvar';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_faixas) as item
    where ((item ->> 'kg_min')::numeric * 1000)::bigint % 5000 <> 0
       or (
         item ->> 'kg_max' is not null
         and ((item ->> 'kg_max')::numeric * 1000)::bigint % 5000 <> 0
       )
  ) then
    raise exception 'Faixa fora da grade de 5 em 5 kg';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_faixas) as item
    left join produtos pr on pr.id = coalesce(
      nullif(item ->> 'produto_id', '')::uuid,
      (select id from produtos where sku_legado = (item ->> 'sku')::sku)
    )
    where pr.id is null
  ) then
    raise exception 'Faixa referencia produto inexistente';
  end if;

  delete from precos_faixa where vigente_desde = p_vigente_desde;

  insert into precos_faixa (produto_id, sku, kg_min, kg_max, preco_unit, vigente_desde)
  select
    pr.id,
    pr.sku_legado,
    (item ->> 'kg_min')::numeric,
    (item ->> 'kg_max')::numeric,
    (item ->> 'preco_unit')::numeric,
    p_vigente_desde
  from jsonb_array_elements(p_faixas) as item
  join produtos pr on pr.id = coalesce(
    nullif(item ->> 'produto_id', '')::uuid,
    (select id from produtos where sku_legado = (item ->> 'sku')::sku)
  );

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

grant execute on function salvar_versao_precos(date, jsonb) to authenticated;
