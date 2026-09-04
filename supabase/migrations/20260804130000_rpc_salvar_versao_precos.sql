-- Salvar uma versão de tabela de preço é atômico: substitui INTEIRAMENTE o que
-- existir naquela vigente_desde, nunca acrescenta. Sem isso, salvar duas vezes na
-- mesma data duplicava faixas (grade antiga + nova convivendo, preço indefinido).
-- SECURITY INVOKER de propósito: a RLS de precos_faixa (só admin escreve) continua
-- valendo dentro da função.
create function salvar_versao_precos(p_vigente_desde date, p_faixas jsonb) returns integer
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

  delete from precos_faixa where vigente_desde = p_vigente_desde;

  insert into precos_faixa (sku, kg_min, kg_max, preco_unit, vigente_desde)
  select
    (item ->> 'sku')::sku,
    (item ->> 'kg_min')::numeric,
    (item ->> 'kg_max')::numeric,
    (item ->> 'preco_unit')::numeric,
    p_vigente_desde
  from jsonb_array_elements(p_faixas) as item;

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

grant execute on function salvar_versao_precos(date, jsonb) to authenticated;
