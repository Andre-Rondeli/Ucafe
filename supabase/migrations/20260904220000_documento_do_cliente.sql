-- CNPJ/CPF do cliente, digitado à mão no cadastro (a busca automática por CNPJ vivia
-- dentro da ponte com o ERP antigo e saiu junto — ver LEIA-PRIMEIRO.md).
--
-- O front-end (Clientes.tsx, useClientes.ts, src/lib/cnpj.ts) já lê e grava esta coluna
-- e já tem validação/formatação testada; só a coluna nunca chegou a existir no banco —
-- toda tela que consulta `clientes` (Pedido, Clientes, Ficha do Cliente) quebrava com
-- "column clientes.documento does not exist". Nullable e sem índice único de propósito:
-- cliente sem documento cadastrado é caso válido (nem todo canal exige), e homônimo com
-- documento vazio não pode colidir.

alter table clientes add column documento text;

notify pgrst, 'reload schema';
