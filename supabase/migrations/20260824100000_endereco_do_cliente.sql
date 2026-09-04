-- Endereço do cliente.
--
-- Sem rua não existe rota: o mapa cai no centro da cidade e o entregador roda a cidade
-- procurando o cliente. Campos separados (e não uma linha de texto) porque é assim que
-- endereço entra em documento fiscal e em busca por bairro.

alter table clientes add column endereco text;
alter table clientes add column numero text;
alter table clientes add column bairro text;
alter table clientes add column cep text;
alter table clientes add column uf text;

notify pgrst, 'reload schema';
