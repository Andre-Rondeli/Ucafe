-- Motorista vê só o que precisa para entregar: pedido pendente, item do pedido e o
-- contato do cliente daquela entrega. Nada de preço de tabela, custo, comissão,
-- consignado, equipe, nem cliente sem entrega pendente.
--
-- A checagem é no BANCO, não na tela: esconder o botão não protege quem chama a API
-- direto com o token do próprio motorista.

create or replace function is_motorista() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and papel = 'motorista' and ativo
  );
$$;

-- security definer para a policy de `clientes` poder olhar `pedidos` sem recursar na
-- RLS de pedidos (que, por sua vez, olha clientes)
create or replace function tem_entrega_pendente(p_cliente_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pedidos
    where cliente_id = p_cliente_id and status = 'aberto'
  );
$$;

alter function public.is_motorista() owner to postgres;
alter function public.tem_entrega_pendente(uuid) owner to postgres;

grant execute on function is_motorista() to authenticated;
grant execute on function tem_entrega_pendente(uuid) to authenticated;

-- a policy de clientes e a tela de Entregas filtram por status + data prevista
create index if not exists pedidos_status_entrega_idx
  on pedidos (status, data_entrega_prevista);

-- ---------------------------------------------------------------- policies

drop policy pedidos_select on pedidos;
create policy pedidos_select on pedidos for select
  using (pode_ver_cliente(cliente_id) or (is_motorista() and status = 'aberto'));

drop policy pedido_itens_select on pedido_itens;
create policy pedido_itens_select on pedido_itens for select
  using (exists (
    select 1 from pedidos p
    where p.id = pedido_id
      and (pode_ver_cliente(p.cliente_id) or (is_motorista() and p.status = 'aberto'))
  ));

drop policy clientes_select on clientes;
create policy clientes_select on clientes for select
  using (
    is_admin()
    or (esta_ativo() and vendedor_id = auth.uid())
    or (is_motorista() and tem_entrega_pendente(id))
  );

-- preço de tabela não é assunto de motorista
drop policy precos_select on precos_faixa;
create policy precos_select on precos_faixa for select
  using (esta_ativo() and not is_motorista());

-- ---------------------------------------------------------------- marcar entregue
-- A policy de update de `pedidos` é do dono do cliente, e o motorista não é dono de
-- nenhum. Em vez de afrouxar a policy (que liberaria qualquer campo), um RPC estreito:
-- só a transição aberto -> entregue, e nada mais. O trigger pedidos_sem_reescrita
-- continua guardando valor, cliente, condição e data.
create or replace function marcar_entregue(p_pedido_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status status_pedido;
  v_cliente_id uuid;
begin
  select status, cliente_id into v_status, v_cliente_id
  from pedidos where id = p_pedido_id;

  if v_status is null then
    raise exception 'Pedido não encontrado';
  end if;

  -- pode_ver_cliente cobre admin e o vendedor dono do cliente
  if not (is_motorista() or pode_ver_cliente(v_cliente_id)) then
    raise exception 'Você não tem permissão para marcar esta entrega';
  end if;

  if v_status = 'entregue' then
    raise exception 'Este pedido já está marcado como entregue';
  end if;

  if v_status = 'cancelado' then
    raise exception 'Pedido cancelado não pode ser marcado como entregue';
  end if;

  update pedidos set status = 'entregue' where id = p_pedido_id;
end;
$$;

alter function public.marcar_entregue(uuid) owner to postgres;
grant execute on function marcar_entregue(uuid) to authenticated;

notify pgrst, 'reload schema';
