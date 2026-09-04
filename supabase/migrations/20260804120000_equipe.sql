-- Gestão de pessoas: coluna ativo em profiles + leitura da equipe pelo admin.
-- Sem tabela nova: profiles_admin_all (is_admin()) já cobre update de nome/papel/ativo.

alter table profiles add column ativo boolean not null default true;

-- auth.users não é acessível pelo cliente; a função expõe só o necessário,
-- e só para quem já é admin (retorna vazio pra qualquer outro chamador).
create function listar_equipe()
returns table(
  id uuid,
  nome text,
  email text,
  papel papel_usuario,
  ativo boolean,
  clientes_ativos bigint,
  criado_em timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.nome,
    u.email,
    p.papel,
    p.ativo,
    coalesce(c.qtd, 0) as clientes_ativos,
    p.created_at
  from profiles p
  join auth.users u on u.id = p.id
  left join (
    select vendedor_id, count(*) as qtd
    from clientes
    where ativo
    group by vendedor_id
  ) c on c.vendedor_id = p.id
  where is_admin()
  order by p.nome;
$$;

grant execute on function listar_equipe() to authenticated;
