-- Pedido lançado não se reescreve. Os totais denormalizados de `pedidos` alimentam
-- todo número do painel e a comissão; a RLS de update permite ao vendedor tocar na
-- própria linha (é por ela que o cancelamento funciona), o que deixava uma fresta:
-- um UPDATE por API direta podia reescrever total_valor/total_kg driblando a
-- validação do RPC criar_pedido. A tela nunca faz isso — cancelar muda só o status.
-- O trigger fecha a fresta para todo mundo: errou, cancela e lança de novo.
create function pedidos_bloquear_reescrita() returns trigger
language plpgsql as $$
begin
  if new.total_kg is distinct from old.total_kg
     or new.total_valor is distinct from old.total_valor
     or new.cliente_id is distinct from old.cliente_id
     or new.condicao_pagamento is distinct from old.condicao_pagamento
     or new.data is distinct from old.data then
    raise exception 'Pedido lançado não se edita — cancele e lance de novo';
  end if;
  return new;
end;
$$;

create trigger pedidos_sem_reescrita
  before update on pedidos
  for each row execute function pedidos_bloquear_reescrita();
