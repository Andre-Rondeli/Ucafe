-- Faixas de EXEMPLO só para a tela ter dado. Os preços reais são cadastrados
-- pelo Carlos na tela Tabela de Preços — não tratar estes números como oficiais.
-- Grade fechada de 5 em 5 kg (todo pedido é múltiplo de 5 kg — ver MULTIPLO_KG em
-- src/lib/preco.ts): a faixa seguinte sempre começa 5 kg acima do teto da anterior.
insert into precos_faixa (sku, kg_min, kg_max, preco_unit, vigente_desde) values
  ('250g',  5,   10,   12.00, '2026-01-01'),
  ('250g', 15,   50,   11.00, '2026-01-01'),
  ('250g', 55, null,   10.00, '2026-01-01'),
  ('500g',  5,   10,   22.00, '2026-01-01'),
  ('500g', 15,   50,   20.00, '2026-01-01'),
  ('500g', 55, null,   18.00, '2026-01-01');
