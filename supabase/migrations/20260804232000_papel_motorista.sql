-- Sozinha de propósito: Postgres cria o valor novo do enum numa transação, mas não
-- deixa USAR esse valor na mesma transação. A migration seguinte (rls_motorista) é
-- que o usa em is_motorista().
alter type papel_usuario add value 'motorista';
