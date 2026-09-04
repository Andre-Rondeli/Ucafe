-- Consignado generalizado por produto — fecha as duas pendências conhecidas:
-- 1. a apuração na Ficha do Cliente só oferecia os 2 produtos legado (250g/500g),
--    porque saldo e pendências somavam por `sku`, que é NULL em produto novo;
-- 2. a comissão de consignado de produto novo caía em "sem preço de referência",
--    porque o join entrega→item de pedido casava por `sku`.
-- A chave passa a ser produto_id em tudo; `sku` vira coluna de histórico.

-- linhas antigas gravadas só com sku (apuração do front anterior) ganham produto_id
update consignado_movimentos cm
set produto_id = p.id
from produtos p
where cm.produto_id is null and p.sku_legado = cm.sku;

-- o front já em produção ainda manda apuração só com sku até o deploy novo ir ao ar:
-- o trigger resolve o produto_id na entrada, em vez de recusar
create function consignado_resolver_produto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.produto_id is null and new.sku is not null then
    select id into new.produto_id from produtos where sku_legado = new.sku;
  end if;
  if new.produto_id is null then
    raise exception 'Movimento de consignado precisa de um produto do catálogo';
  end if;
  return new;
end;
$$;

create trigger consignado_produto_obrigatorio
  before insert on consignado_movimentos
  for each row execute function consignado_resolver_produto();

alter table consignado_movimentos alter column produto_id set not null;

-- ---------------------------------------------------------------- pendências por produto
-- O shape de retorno muda (uma linha por cliente×produto, não mais colunas fixas
-- saldo_250g/saldo_500g), então é drop + create — create or replace não troca colunas OUT.
drop function if exists pendencias_consignado();

create function pendencias_consignado()
returns table (
  cliente_id uuid,
  cliente_nome text,
  whatsapp text,
  vendedor_id uuid,
  prazo_retorno date,
  produto_id uuid,
  produto_nome text,
  peso_kg numeric,
  saldo_pacotes bigint,
  ultima_apuracao date,
  ultima_entrega date
)
language sql stable security definer set search_path = public as $$
  with saldo as (
    select
      cm.cliente_id,
      cm.produto_id,
      coalesce(sum(cm.qtd_pacotes) filter (where cm.tipo = 'entrega'), 0)
        - coalesce(sum(cm.qtd_pacotes) filter (where cm.tipo in ('venda_apurada', 'retorno')), 0)
        as saldo_pacotes,
      max(cm.data) filter (where cm.tipo = 'venda_apurada') as ultima_apuracao,
      max(cm.data) filter (where cm.tipo = 'entrega') as ultima_entrega
    from consignado_movimentos cm
    group by cm.cliente_id, cm.produto_id
  )
  select
    c.id as cliente_id,
    c.nome as cliente_nome,
    c.whatsapp,
    c.vendedor_id,
    (
      -- prazo mais urgente ainda pendente do cliente (o prazo é do cliente, não do produto)
      select min(p.prazo_retorno)
      from pedidos p
      where p.cliente_id = c.id
        and p.condicao_pagamento = 'consignado'
        and p.status <> 'cancelado'
        and p.prazo_retorno is not null
    ) as prazo_retorno,
    pr.id as produto_id,
    pr.nome as produto_nome,
    pr.peso_kg,
    s.saldo_pacotes,
    s.ultima_apuracao,
    s.ultima_entrega
  from clientes c
  join saldo s on s.cliente_id = c.id
  join produtos pr on pr.id = s.produto_id
  where s.saldo_pacotes <> 0
    and (is_admin() or (esta_ativo() and c.vendedor_id = auth.uid()))
$$;

grant execute on function pendencias_consignado() to authenticated;

-- ---------------------------------------------------------------- comissão por produto
-- Único troço que muda: o preço de referência da apuração é o da última ENTREGA do
-- MESMO PRODUTO (antes: mesmo sku, que não existe em produto novo).
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
    join pedido_itens pi on pi.pedido_id = pe.id and pi.produto_id = entrega.produto_id
    where entrega.cliente_id = m.cliente_id
      and entrega.produto_id = m.produto_id
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

notify pgrst, 'reload schema';
