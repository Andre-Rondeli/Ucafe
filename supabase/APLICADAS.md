# Migrations aplicadas no banco

**Este arquivo é a memória de que uma migration REALMENTE subiu.** Ele existe porque
mergear não muda o banco: aqui a migration é aplicada à mão, e sem um registro versionado
o esquecimento não deixa rastro. Num projeto irmão, em 24/08/2026, duas migrations foram
mergeadas, a Edge Function que dependia delas foi publicada, e ninguém percebeu que o banco
não tinha nenhuma das duas — o app ficou pronto para gravar numa coluna inexistente.

`scripts/migrations.test.ts` confere: **arquivo novo em `supabase/migrations/` sem linha
nova aqui quebra o teste.** Não é burocracia — é o único ponto do fluxo em que o
esquecimento vira erro visível em vez de silêncio.

## No primeiro dia

A lista abaixo já nasce completa porque a montagem do projeto aplica as 29
migrations de uma vez, na ordem do nome do arquivo (ver `docs/COMO-RODAR.md` → Banco). Se
você ainda não fez isso, **a lista está mentindo** — aplique antes de confiar nela. Da
primeira migration nova em diante, a regra abaixo é o que vale.

## Como usar

1. Aplique a migration no banco (SQL Editor do Supabase ou `supabase db push`).
2. Confira que o objeto existe de verdade — a coluna, a policy, a função. Migration
   registrada não é prova; objeto vivo é.
3. Acrescente o **nome** dela na lista abaixo (o nome é o que vem depois do número no
   arquivo). O número NÃO entra: quando se aplica pelo painel, o `version` gravado no banco
   é o horário da aplicação e não bate com o do arquivo — por isso a conferência é por nome.

Para conferir a lista contra o banco:

```sql
select name from supabase_migrations.schema_migrations order by version;
```

## Aplicadas

- init_torrao
- rpc_criar_pedido
- validar_totais_pedido
- pedido_multiplo_5kg
- equipe
- rpc_salvar_versao_precos
- comissao
- rpc_bases_comissao
- prazo_consignado
- rpc_pendencias_consignado
- produtos
- storage_produtos
- criar_pedido_produto
- entrega_prevista
- rls_ativo
- consignado_produto
- pedido_imutavel
- item_multiplo_5kg
- produto_custo
- papel_motorista
- rls_motorista
- rotina_config
- endereco_do_cliente
- avisos_e_push
- preco_por_cliente
- cron_rotina_recompra
- fechar_rpc_para_anon
- espelho_da_rede
- cron_espelho_da_rede
- documento_do_cliente
